'use babel';

import MmLintView from './mm-lint-view';
import {CompositeDisposable} from 'atom';
//import { CompositeDisposable, TokenizedLine } from 'atom';
import MathematicaGrammar from './mathematica-grammar'

export default {

  // mmLintView: null,
  // modalPanel: null,
  subscriptions: null,

  activate(state) {

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();
    
    this.grammar = new MathematicaGrammar(atom.grammars)
    
    this.subscriptions.add(
      atom.grammars.addGrammar(this.grammar)
    )
    
    var changeEditor = function(editor) {
      if (!editor) {
        return
      }
      if (editor.getGrammar().scopeName != "source.mathematica") {
        return
      }
      this.grammar.editorChanged(editor,this.subscriptions)
    }
    
    var newEditor = function(event,editor) {
      if (!editor) {
        return
      }
      if (editor.getGrammar().scopeName != "source.mathematica") {
        return
      }
      this.grammar.editorChanged(editor,this.subscriptions)
    }
    
    atom.workspace.getTextEditors().map(function(editor){
      changeEditor.bind(this)(editor)
    },this)
    
    this.subscriptions.add(atom.workspace.onDidAddTextEditor(newEditor.bind(this)))
    this.subscriptions.add(atom.workspace.observeActiveTextEditor(changeEditor.bind(this)))
    
  },
  
  addGrammarForEditor(editorObject) {
    
    var editor = editorObject.textEditor
    var buffer = editor.buffer
    var editors = atom.workspace.getTextEditors()
    
    var otherEditors = editors.filter(function(testEditor) {
      return (editor != testEditor)
    })
    var editorsWithSameBuffer = otherEditors.filter(function(testEditor) {
      return (buffer == testEditor.buffer)
    })
        
    var tokenBuffer = editor.tokenizedBuffer
    debugger
    var newGrammar = new MathematicaGrammar(atom.grammars,tokenBuffer)
    
    this.subscriptions.add(
      atom.grammars.addGrammar(newGrammar)
    )
    
    editor.setGrammar(newGrammar)
    this.subscriptions.add(buffer.onWillChange(newGrammar.bufferWillChange.bind(newGrammar)))
    this.subscriptions.add(buffer.onDidStopChanging(newGrammar.bufferDidChange.bind(newGrammar)))
    
    editorsWithSameBuffer.map(function(editorWithSameBuffer) {
      editorWithSameBuffer.setGrammar(newGrammar)
      editorWithSameBuffer.displayLayer.setTextDecorationLayer(tokenBuffer)
      //editorWithSameBuffer.tokenizedBuffer = newGrammar.tokenBuffer
    })
    
    debugger
    
    
  },
  

  deactivate() {
    //this.modalPanel.destroy();
    this.subscriptions.dispose();
    //this.mmLintView.destroy();
  },

};