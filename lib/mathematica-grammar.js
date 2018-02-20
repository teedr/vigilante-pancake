'use babel';
import path from 'path' 
import MathematicaParser from './mathematica-parser'
import {Grammar} from 'first-mate';
tokPath = path.join(atom.packages.resourcePath,"src","tokenized-line")
console.log(tokPath);
TokenizedLine = require(tokPath);

export default class MathematicaGrammar extends Grammar {
  
  constructor (registry) {
    scopeName = 'source.mathematica-semantic'
    name = 'Mathematica (Semantic Highlighting)'
    fileTypes = ['m']
    maxLineLength = 10000
    maxTokensPerLine = 1000
    
    super(registry,{
      scopeName,
      name,
      fileTypes,
      maxLineLength,
      maxTokensPerLine
    })
    
    this.registry = registry
    this.parserCache = {}
    this.tokBuffID = 1
  }
  
  editorChanged(editor,subscriptions) {
    let editorBuffer = editor.buffer;
    let bufferID = editorBuffer.id;
    let tokenBuffer = editor.languageMode;
    
    if (this.parserCache[bufferID] && (this.parserCache[bufferID].parser instanceof MathematicaParser)) {
      let existingParser = this.parserCache[bufferID].parser;
      console.log("existing");
      tokenBuffer.buildTokenizedLineForRow = this.buildTokenizedLineForRow(tokenBuffer,existingParser);
      return
    }

    console.log("new");

    this.parserCache[bufferID] = {}
    let parser = new MathematicaParser(editorBuffer)
    this.parserCache[bufferID].parser = parser
    tokenBuffer.buildTokenizedLineForRow = this.buildTokenizedLineForRow(tokenBuffer,parser);

    editor.setGrammar(this);
    this.tokenize(parser);

    subscriptions.add(editorBuffer.onDidChangeText(this.bufferDidChangeText(parser)));
    subscriptions.add(editorBuffer.onDidStopChanging(this.bufferDidStopChanging(parser)))
  }
  
  buildTokenizedLineForRow (tokBuffer,prsr) {
    let buff = tokBuffer;
    let p = prsr;
    
    var func =  function (row, ruleStack, openScopes) {
      let tags = []
      let tokenArray = []
      const lineEnding = buff.buffer.lineEndingForRow(row)
      
      if (!ruleStack) {
        initialRule = this.getInitialRule()
        let scopeName = initialRule.scopeName;
        let contentScopeName = initialRule.contentScopeName;
        ruleStack = [{rule: initialRule, scopeName:scopeName, contentScopeName:contentScopeName}]
      }
      
      if (openScopes.length == 0) {
        openScopes.push(this.startIdForScope(this.scopeName));
      }
            
      let text = buff.buffer.lineForRow(row);
      
      // for extremely long lines, tokenization/parsing will hang
      if (buff.buffer.lineLengthForRow(row) > 1000) {
        return new TokenizedLine({
          openScopes: openScopes,
          text: text,
          tags: tags,
          ruleStack: ruleStack,
          lineEnding: lineEnding,
          tokenIterator: buff.tokenIterator,
          grammar: buff.grammar
        })
      };
      
      let tokens = p.tokensForLine(row);
      
      tokens.map((token, i) => {
        if (token.scope == null) {
          tags.push(token.length)
        } else {
          tags.push(this.startIdForScope(token.scope))
          tags.push(token.length)
          tags.push(this.endIdForScope(token.scope))
        }
      })
      
      return new TokenizedLine({
        openScopes: openScopes,
        text: text,
        tags: tags,
        ruleStack: ruleStack,
        lineEnding: lineEnding,
        tokenIterator: buff.tokenIterator,
        grammar: buff.grammar
      })
    };
    
    return func.bind(this)
  }

  grammarUpdated () {}

  dispose () {}
  
  getScore () {
    var mmGrammar = this.registry.grammarForScopeName("source.mathematica-semantic")
    console.log(mmGrammar);
    if (mmGrammar != null) {
      return (mmGrammar.getScore.apply(mmGrammar, arguments) - 1)
    } else {
      return 0
    }
  }

  onDidUpdate (callback) {
    return { dispose () { } }
  }

  scopeForId (id) {
    return this.registry.scopeForId(id)
  }
  startIdForScope (scope) {
    return this.registry.textmateRegistry.startIdForScope(scope)
  }
  endIdForScope (scope) {
    return this.registry.textmateRegistry.endIdForScope(scope)
  }

  scopesFromStack (stack, rule, endPatternMatch) {
    console.log('scopesFromStack', ...arguments)
  }

  tokenizeLines (text) {
    const lines = text.split('\n')
    const scopes = []
    let ruleStack, tags
    return lines.map((line, i) => {
      ({ tags, ruleStack } = this.tokenizeLine(line, ruleStack, i === 0))
      return this.registry.decodeTokens(line, tags, scopes)
    })
  }

  tokenizeLine (line, ruleStack = [], firstLine) {
    let tags = []
    let tokenArray = []
    return {line,tags,tokenArray,ruleStack}  
  }
    
  tokenize(parser) {
    try {
      parser.parse()
    } catch(ex) {
      console.log(ex);
    }    
  }

  getLinterErrors(editor) {
    let editorBuffer = editor.buffer;
    let bufferID = editorBuffer.id;
    
    if (!(this.parserCache[bufferID] && (this.parserCache[bufferID].parser instanceof MathematicaParser))) {
      return [];
    }
    
    const editorPath = editor.getPath()
    
    let parser = this.parserCache[bufferID].parser;
    let errors = parser.getErrors();
    
    let linterErrors = [];
    
    for (var i = 0; i < errors.length; i++) {
      let err = errors[i];
      let startPoint = editorBuffer.positionForCharacterIndex(err.start);
      let endPoint = editorBuffer.positionForCharacterIndex(err.end);
      let position = [
        [startPoint.row, startPoint.column],
        [endPoint.row, endPoint.column],
      ]
      let excerpt = err.description;
      let text = err.longText;
      let range = new Range(startPoint,endPoint);
      let severity = 'error';
      if(err.warning) {
        severity = 'warning';
      }
      
      linterErrors.push({
        severity: severity,
        location: {
          file: editorPath,
          position: position,
        },
        excerpt: excerpt,
        description: text
        
      })
      
    }
    
    return linterErrors
  }
  
  bufferDidChangeText(parser) {
    let p = parser;
    return function (e) {
      let buffer = p.buffer;
      if (!(buffer.isAlive())) {
        return;
      }

      let tokenizedBuffer = buffer.languageMode;
      var invalidatedLines = p.tokenizeChanges(e)
      //console.log(["tokenInvalid:",invalidatedLines]);
      
      tokenizedBuffer.invalidRows = invalidatedLines.slice();
      tokenizedBuffer.tokenizeInBackground();
      
    }
  }
  
  bufferDidStopChanging(parser) {
    let p = parser;
    return function (e) {
      if (e.changes.length == 0) {
        return;
      }
      
      let buffer = p.buffer;
      if (!(buffer.isAlive())) {
        return;
      }
      
      let tokenizedBuffer = buffer.languageMode;
      
      var invalidatedLines = p.parseChanges(e);
      
      tokenizedBuffer.invalidRows = invalidatedLines.slice();
      tokenizedBuffer.tokenizeInBackground();
      
    }
  }
}