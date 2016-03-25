/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

import CharacterProxy from './characterproxy.js';
import Text from './text.js';
import DocumentFragment from './documentfragment.js';
import utils from '../../utils/utils.js';
import clone from '../../utils/lib/lodash/clone.js';
import CKEditorError from '../../utils/ckeditorerror.js';

/**
 * This is a private helper-class for {@link engine.treeModel.NodeList} text compression utility.
 *
 * @protected
 * @memberOf engine.treeModel
 * @extends engine.treeModel.Text
 */
class NodeListText extends Text {
	/**
	 * @see engine.treeModel.Text#constructor
	 * @protected
	 * @constructor
	 */
	constructor( text, attrs ) {
		super( text, attrs );

		/**
		 * Element that contains character nodes represented by this NodeListText.
		 *
		 * @type {engine.treeModel.Element|engine.treeModel.DocumentFragment|null}
		 */
		this.parent = null;
	}

	/**
	 * Gets a character at given index and creates a {@link engine.treeModel.CharacterProxy} out of it.
	 *
	 * @param {Number} index Character index.
	 * @returns {engine.treeModel.CharacterProxy}
	 */
	getCharAt( index ) {
		index = index && index >= 0 ? index : 0;

		return new CharacterProxy( this, index );
	}

	/**
	 * Custom toJSON method to solve child-parent circular dependencies.
	 *
	 * @returns {Object} Clone of this object with the parent property replaced with its name.
	 */
	toJSON() {
		const json = clone( this );

		json.parent = json.parent ? this.parent.name : null;

		return json;
	}
}

/**
 * List of nodes. It is used to represent multiple nodes with a given order, for example children of
 * {@link engine.treeModel.Element} object or nodes inserted using {@link engine.treeModel.operation.InsertOperation}.
 *
 * Thanks to the constructor, which accepts various arguments, this class lets you easily create desired list of nodes.
 *
 * Parameters passed to constructor are converted and internally kept as an array of {@link engine.treeModel.Node}
 * and {@link engine.treeModel.Text} instances.
 *
 * @memberOf engine.treeModel
 */
export default class NodeList {
	/**
	 * Constructor lets you create a list of nodes in many ways. See examples:
	 *
	 *		let nodeList = new NodeList( [ new Element( p1 ), new Element( p1 ) ] );
	 *		nodeList.length; // 2
	 *
	 *		let nodeList = new NodeList( new Element( p ) );
	 *		nodeList.length; // 1
	 *
	 *		let nodeList = new NodeList( [ 'foo', new Element( p ), 'bar' ] );
	 *		nodeList.length; // 7
	 *
	 *		let nodeList = new NodeList( 'foo' );
	 *		nodeList.length; // 3
	 *
	 *		let nodeList = new NodeList( new Text( 'foo', { bar: 'bom' } ) );
	 *		nodeList.length; // 3
	 *		nodeList.get( 0 ).getAttribute( 'bar' ); // 'bom'
	 *		nodeList.get( 1 ).getAttribute( 'bar' ); // 'bom'
	 *		nodeList.get( 2 ).getAttribute( 'bar' ); // 'bom'
	 *
	 *		let nodeListA = new NodeList( 'foo' );
	 *		let nodeListB = new NodeList( nodeListA );
	 *		nodeListA === nodeListB // true
	 *		nodeListB.length // 3
	 *
	 * @see engine.treeModel.NodeSet
	 *
	 * @param {engine.treeModel.NodeSet} nodes List of nodes.
	 * @constructor
	 */
	constructor( nodes ) {
		if ( nodes instanceof NodeList ) {
			// We do not clone anything.
			return nodes;
		} else if ( nodes instanceof DocumentFragment ) {
			return nodes._children;
		}

		/**
		 * Internal array to store nodes.
		 *
		 * @protected
		 * @member {Array} engine.treeModel.NodeList#_nodes
		 */
		this._nodes = [];

		/**
		 * Internal array where each index is mapped to correct node from `_nodes` array. This is introduced
		 * to easily refer `_nodes` by index, since some of elements in `_nodes` may contain multiple characters,
		 * which occupy multiple slots in `_indexMap`.
		 *
		 * @private
		 * @member {Array} engine.treeModel.NodeList#_indexMap
		 */
		this._indexMap = [];

		if ( nodes ) {
			if ( typeof nodes == 'string' || !utils.isIterable( nodes ) ) {
				nodes = [ nodes ];
			}

			for ( let node of nodes ) {
				let indexInNodes = this._nodes.length;
				let mergedWithPrev = false;
				let length = 1;

				if ( node instanceof CharacterProxy ) {
					node = new NodeListText( node.character, node._attrs );
				} else if ( node instanceof Text ) {
					node = new NodeListText( node.text, node._attrs );
				} else if ( typeof node == 'string' ) {
					node = new NodeListText( node, [] );
				}

				if ( node instanceof NodeListText ) {
					length = node.text.length;

					let prev = this._nodes[ this._nodes.length - 1 ];

					if ( prev instanceof NodeListText && utils.mapsEqual( prev._attrs, node._attrs ) ) {
						// If previously added text has same attributes, merge this text with it.
						prev.text += node.text;
						mergedWithPrev = true;
						indexInNodes--;
					} else if ( node.text.length === 0 ) {
						// If this is an empty text just omit it.
						continue;
					}
				}

				if ( !mergedWithPrev ) {
					this._nodes.push( node );
				}

				for ( let i = 0; i < length; i++ ) {
					this._indexMap.push( indexInNodes );
				}
			}
		}
	}

	/**
	 * Number of nodes in the node list.
	 *
	 * @readonly
	 * @type {Number}
	 */
	get length() {
		return this._indexMap.length;
	}

	/**
	 * Node list iterator.
	 */
	[ Symbol.iterator ]() {
		let i = 0;

		return {
			next: () => ( {
				done: i == this.length,
				value: this.get( i++ )
			} )
		};
	}

	/**
	 * Returns node at the given index.
	 *
	 * @param {Number} index Node index.
	 * @returns {engine.treeModel.Node} Node at given index.
	 */
	get( index ) {
		let realIndex = this._indexMap[ index ];
		let node = this._nodes[ realIndex ];

		if ( node instanceof NodeListText ) {
			return node.getCharAt( this._getCharIndex( index ) );
		} else {
			return node;
		}
	}

	/**
	 * Search for the element in the node list.
	 *
	 * @param {engine.treeModel.Node} node Node to find.
	 * @returns {Number} Position of the element in the list or -1 if not found.
	 */
	indexOf( node ) {
		if ( node instanceof CharacterProxy ) {
			let baseIndex = this.indexOf( node._nodeListText );

			return baseIndex == -1 ? -1 : baseIndex + node._index;
		}

		let realIndex = this._nodes.indexOf( node );

		return this._indexMap.indexOf( realIndex );
	}

	/**
	 * Inserts nodes from the given node list into this node list at the given index.
	 *
	 * @param {Number} index Position where nodes should be inserted.
	 * @param {engine.treeModel.NodeList} nodeList List of nodes to insert.
	 */
	insert( index, nodeList ) {
		if ( this._nodes.length === 0 ) {
			this._nodes = nodeList._nodes.slice();
			this._indexMap = nodeList._indexMap.slice();

			return;
		}

		// If we are inserting into a text, splitting may be needed.
		this._splitNodeAt( index );

		// If `index` is too high to be found in `_indexMap` it means that we insert at the end of node list.
		let realIndex = index >= this._indexMap.length ? this._nodes.length : this._indexMap[ index ];

		// Splice arrays from inserted nodeList into this nodeList.
		this._indexMap.splice.apply( this._indexMap, [ index, 0 ].concat( nodeList._indexMap ) );
		this._nodes.splice.apply( this._nodes, [ realIndex, 0 ].concat( nodeList._nodes ) );

		// Fix indexes in index map.
		// From the beginning of spliced-in array to the end of spliced-in array.
		for ( let i = index; i < index + nodeList._indexMap.length; i++ ) {
			this._indexMap[ i ] += realIndex;
		}

		// From the end of spliced-in array to the end of original array.
		for ( let i = index + nodeList._indexMap.length; i < this._indexMap.length; i++ ) {
			this._indexMap[ i ] += nodeList._nodes.length;
		}

		this._mergeNodeAt( index );
		this._mergeNodeAt( index + nodeList.length );
	}

	/**
	 * Removes number of nodes starting at the given index.
	 *
	 * @param {Number} index Position of the first node to remove.
	 * @param {Number} number Number of nodes to remove.
	 * @returns {engine.treeModel.NodeList} List of removed nodes.
	 */
	remove( index, number ) {
		if ( this._nodes.length === 0 ) {
			return new NodeList();
		}

		// Removed "range" may start in NodeListText or end in NodeListText. Some splitting may be needed.
		this._splitNodeAt( index );
		this._splitNodeAt( index + number );

		// If given index is too high to be found in `_indexMap` it means that we remove to the end of node list.
		let realIndexEnd = ( index + number ) >= this._indexMap.length ? this._nodes.length : this._indexMap[ index + number ];
		let realIndexStart = this._indexMap[ index ];
		let removed = this._nodes.splice( realIndexStart, realIndexEnd - realIndexStart );

		this._indexMap.splice( index, number );

		for ( let i = index; i < this._indexMap.length ; i++ ) {
			this._indexMap[ i ] -= removed.length;
		}

		this._mergeNodeAt( index );

		return new NodeList( removed );
	}

	/**
	 * Sets or removes given attribute on a range of nodes in the node list.
	 *
	 * @param {Number} index Position of the first node to change.
	 * @param {Number} number Number of nodes to change.
	 * @param {String} key Attribute key to change.
	 * @param {*} [attribute] Attribute value or null if attribute with given key should be removed.
	 */
	setAttribute( index, number, key, value ) {
		if ( index < 0 || index + number > this.length ) {
			/**
			 * Trying to set attribute on non-existing node list items.
			 *
			 * @error nodelist-setattribute-out-of-bounds
			 * @param root
			 */
			throw new CKEditorError( 'nodelist-setattribute-out-of-bounds: Trying to set attribute on non-existing node list items.' );
		}

		// "Range" of nodes to remove attributes may start in NodeListText or end in NodeListText. Some splitting may be needed.
		this._splitNodeAt( index );
		this._splitNodeAt( index + number );

		let i = index;

		while ( i < index + number ) {
			let node = this._nodes[ this._indexMap[ i ] ];

			if ( node instanceof NodeListText ) {
				if ( value !== null ) {
					node._attrs.set( key, value );
				} else {
					node._attrs.delete( key );
				}

				this._mergeNodeAt( i );
				i += node.text.length;
			} else {
				if ( value !== null ) {
					node.setAttribute( key, value );
				} else {
					node.removeAttribute( key );
				}

				i++;
			}
		}

		this._mergeNodeAt( index + number );
	}

	/**
	 * Checks whether given index is inside a text and if so, splits that text node. This method should be used
	 * to split text objects whenever there are some changes made on a part of text object (i.e. removing part of text,
	 * inserting between text object, changing attributes of part of a text object).
	 *
	 * @protected
	 * @param {Number} index Index in the node list at which node should be broken.
	 */
	_splitNodeAt( index ) {
		if ( this._indexMap[ index ] != this._indexMap[ index - 1 ] || this._indexMap.length === 0 ) {
			// Node before and node after splitting point are already different.
			// Or the node list is empty.
			// No splitting is needed.
			return;
		}

		let realIndex = this._indexMap[ index ];
		let node = this._nodes[ realIndex ];

		// Get position in the text node where the text should be split.
		let charIndex = this._getCharIndex( index );

		// Get text part before and after split point.
		let textBefore = node.text.substr( 0, charIndex );
		let textAfter = node.text.substr( charIndex );

		// "Remove" part after split point from current text node.
		node.text = textBefore;

		// Create a new text node with the "removed" part and splice it after original node.
		let newText = new NodeListText( textAfter, node._attrs );
		newText.parent = node.parent;
		this._nodes.splice.call( this._nodes, realIndex + 1, 0, newText );

		// We added new element in the middle of _nodes what invalidated _indexMap. We have to fix it.
		for ( let i = index; i < this._indexMap.length; i++ ) {
			this._indexMap[ i ]++;
		}
	}

	/**
	 * Checks whether given index is between two text nodes that have same attributes and if so, merges them
	 * together into one node. Used to compress characters into large text objects and use less memory. This method
	 * should be used whenever there are some changed done to the node list to check whether it is possible to merge
	 * text objects.
	 *
	 * @param {Number} index Index in the node list at which node should be merged.
	 * @protected
	 */
	_mergeNodeAt( index ) {
		if ( this._indexMap[ index ] == this._indexMap[ index - 1 ] || this._indexMap.length === 0 ) {
			// Node before and node after splitting point are already same.
			// Or the node list is empty.
			// No splitting is needed.
			return;
		}

		// Get the node before and after given index.
		let realIndexBefore = this._indexMap[ index - 1 ];
		let realIndexAfter = this._indexMap[ index ];

		let nodeBefore = this._nodes[ realIndexBefore ];
		let nodeAfter = this._nodes[ realIndexAfter ];

		// Check if both of those nodes are text objects with same attributes.
		if ( nodeBefore instanceof NodeListText && nodeAfter instanceof NodeListText && utils.mapsEqual( nodeBefore._attrs, nodeAfter._attrs ) ) {
			// Append text of text node after index to the before one.
			nodeBefore.text += nodeAfter.text;

			// Remove text node after index.
			this._nodes.splice( realIndexAfter, 1 );

			for ( let i = index; i < this._indexMap.length ; i++ ) {
				this._indexMap[ i ]--;
			}
		}
	}

	/**
	 * Helper function that takes an index in a node list that is inside a text node and returns the offset of that
	 * index from the beginning of that text node. If index
	 *
	 * @param index
	 * @returns {Number} Offset of given index from the beginning of the text node.
	 * @private
	 */
	_getCharIndex( index ) {
		return index - this._indexMap.indexOf( this._indexMap[ index ] );
	}
}

/**
 * Value that is convertible to an item kept in {@link engine.treeModel.NodeList} or an iterable collection of such items.
 * In other words, this is anything that {@link engine.treeModel.NodeList#constructor} is able to take and convert to node:
 * * {@link engine.treeModel.Node} will be left as is
 * * {@link engine.treeModel.Text} and {String} will be converted to a set of {@link engine.treeModel.CharacterProxy}
 * * {@link engine.treeModel.NodeList} will clone a node list (but not the nodes inside, so the new and passed list will
 * point to the same nodes.
 * * Iterable collection of above items will be iterated over and all items will be added to the node list.
 *
 * @typedef {engine.treeModel.Node|engine.treeModel.Text|String|engine.treeModel.NodeList|engine.treeModel.DocumentFragment|Iterable}
 * engine.treeModel.NodeSet
 */
