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
    atom.grammars.addGrammar(this.grammar);
    
    var changeEditor = function(editor) {
      if (!editor) {
        return
      }
      if (editor.getGrammar().scopeName != "source.mathematica-semantic") {
        return
      }
      this.grammar.editorChanged(editor,this.subscriptions)
    }
    
    var newEditor = function(event,editor) {
      if (!editor) {
        return
      }
      if (editor.getGrammar().scopeName != "source.mathematica-semantic") {
        return
      }
      this.grammar.editorChanged(editor,this.subscriptions);
    }
    
    atom.workspace.getTextEditors().map(function(editor){
      changeEditor.bind(this)(editor);
    },this)
    this.subscriptions.add(atom.workspace.observeTextEditors(changeEditor.bind(this)));
    // this.subscriptions.add(atom.workspace.onDidAddTextEditor(newEditor.bind(this)))
    // this.subscriptions.add(atom.workspace.observeActiveTextEditor(changeEditor.bind(this)))
    
  },
  
  provideLinter() {
    return {
      name: 'Mathematica Linter',
      scope: 'file', // or 'project'
      lintsOnChange: false, // or true
      lintOnChangeInterval: 1000,
      grammarScopes: ['source.mathematica-semantic'],
      lint: (textEditor) => {
        console.log("linting");
        let grammar = textEditor.getGrammar();
        
        if (!(grammar instanceof MathematicaGrammar)) {
          return [];
        }
        
        // let linterErrors = grammar.getLinterErrors(textEditor);
        // 
        // return linterErrors;
        // Do something sync
        // return [{
        //   severity: 'info',
        //   location: {
        //     file: editorPath,
        //     position: [[0, 0], [0, 1]],
        //   },
        //   excerpt: `A random value is ${Math.random()}`,
        //   description: `### What is this?\nThis is a randomly generated value`
        // }]

        //Do something async
        return new Promise(function(resolve) {
          // let grammar = textEditor.getGrammar();
          // 
          // if (!(grammar instanceof MathematicaGrammar)) {
          //   resolve()
          // }
          // 
          let linterErrors = grammar.getLinterErrors(textEditor);
          
          resolve(linterErrors)
        })
      }
    }
  },

  deactivate() {
    //this.modalPanel.destroy();
    this.subscriptions.dispose();
    //this.mmLintView.destroy();
  },

};