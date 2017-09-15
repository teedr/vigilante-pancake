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
    // this.mmLintView = new MmLintView(state.mmLintViewState);
    // this.modalPanel = atom.workspace.addModalPanel({
    //   item: this.mmLintView.getElement(),
    //   visible: false
    // });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();
    // editor = atom.workspace.getActiveTextEditor()
    // buffer = editor.buffer
    // tokenBuffer = editor.tokenizedBuffer
    // 
    // newGrammar = new MathematicaGrammar(atom.grammars,tokenBuffer)
    
    this.grammar = new MathematicaGrammar(atom.grammars)
    
    this.subscriptions.add(
      atom.grammars.addGrammar(this.grammar)
    )
    
    var changeEditor = function(editor) {
      if (this.grammar instanceof MathematicaGrammar) {
        this.grammar.editorChanged(editor,this.subscriptions)
      }
    }
    
    atom.workspace.getTextEditors().map(function(editor){
      changeEditor.bind(this)(editor)
    },this)
    
    this.subscriptions.add(atom.workspace.onDidAddTextEditor(changeEditor.bind(this)))
    this.subscriptions.add(atom.workspace.observeActiveTextEditor(changeEditor.bind(this)))
    
    // this.subscriptions.add(buffer.onWillChange(newGrammar.bufferWillChange.bind(newGrammar)))
    // this.subscriptions.add(buffer.onDidStopChanging(newGrammar.bufferDidChange.bind(newGrammar)))

    // Register command that toggles this view
    // this.subscriptions.add(atom.commands.add('atom-workspace', {
    //   'mm-lint:toggle': () => this.toggle()
    // }));
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
    
    // if (editorsWithSameBuffer.length > 0) {
    //   var inheritedGrammar = editorsWithSameBuffer[0].getGrammar()
    //   editor.setGrammar(inheritedGrammar)
    //   editor.tokenizedBuffer = inheritedGrammar.tokenBuffer
    //   return
    // }
    
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
  
  // atom.workspace.observeTextEditors (editor) ->
  // original = editor.getGrammar()
  // if original? and original is atom.grammars.grammarForScopeName('text.plain.null-grammar')
  //   editor.setGrammar(atom.grammars.grammarForScopeName('source.shell'))

  deactivate() {
    //this.modalPanel.destroy();
    this.subscriptions.dispose();
    //this.mmLintView.destroy();
  },

  // serialize() {
  //   return {
  //     mmLintViewState: this.mmLintView.serialize()
  //   };
  // },

  // toggle() {
  //   console.log('MmLint was toggled!');
  //   return
  //   // return (
  //   //   this.modalPanel.isVisible() ?
  //   //   this.modalPanel.hide() :
  //   //   this.modalPanel.show()
  //   // );
  // }

};