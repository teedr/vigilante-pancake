'use babel';
import path from 'path' 
import MathematicaParser from './mathematica-parser'
tokPath = path.join(atom.packages.resourcePath,"src","tokenized-line")
console.log(tokPath);
TokenizedLine = require(tokPath);

export default class MathematicaGrammar {
  constructor (registry) {
    this.scopeName = 'source.mathematica-semantic'
    this.name = 'Mathematica (Semantic Highlighting)'
    this.fileTypes = ['m']
    this.registry = registry
    this.maxLineLength = 10000
    this.maxTokensPerLine = 1000
    this.parserCache = {}
    this.tokBuffID = 0
  }
  
  editorChanged(editor,subscriptions) {
    let editorBuffer = editor.buffer;
    let bufferID = editorBuffer.id;
    let tokenBuffer = editor.tokenizedBuffer;
    
    if (this.parserCache[bufferID] && (this.parserCache[bufferID].parser instanceof MathematicaParser)) {
      let existingParser = this.parserCache[bufferID].parser;
      tokenBuffer.buildTokenizedLineForRow = this.buildTokenizedLineForRow(tokenBuffer,existingParser);
      if (!(editor.getGrammar() instanceof MathematicaGrammar)) {
        editor.setGrammar(this);
      }
      if (!tokenBuffer.id) {
        tokenBuffer.id = this.tokBuffID++;
        subscriptions.add(editorBuffer.onWillChange(this.bufferWillChange(existingParser,tokenBuffer)));
        subscriptions.add(editorBuffer.onDidStopChanging(this.bufferDidChange(existingParser,tokenBuffer)));
      }
      return
    }
    
    this.parserCache[bufferID] = {}
    let parser = new MathematicaParser(editorBuffer)
    this.parserCache[bufferID].parser = parser
    tokenBuffer.buildTokenizedLineForRow = this.buildTokenizedLineForRow(tokenBuffer,parser);
    tokenBuffer.id = this.tokBuffID++;
    editor.setGrammar(this);
    this.tokenize(parser);

    subscriptions.add(editorBuffer.onWillChange(this.bufferWillChange(parser,tokenBuffer)))
    subscriptions.add(editorBuffer.onDidStopChanging(this.bufferDidChange(parser,tokenBuffer)))
  }
  
  buildTokenizedLineForRow (tokBuffer,prsr) {
    let buff = tokBuffer;
    let p = prsr;
    
    var func =  function (row, ruleStack = [], openScopes) {
      //console.log(["building..",row,buff.id,buff.buffer.id,buff,p]);
      let tags = []
      let tokenArray = []
      const lineEnding = buff.buffer.lineEndingForRow(row)
            
      let text = buff.buffer.lineForRow(row);
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
    return this.registry.startIdForScope(scope)
  }
  endIdForScope (scope) {
    return this.registry.endIdForScope(scope)
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
  
  bufferWillChange(parser,tokenBuffer) {
    let p = parser;
    let tb = tokenBuffer;
    return function (e) {
      let invalidatedLines = p.updateChange(e)
      for (var i = 0; i < invalidatedLines.length; i++) {
        tb.invalidateRow(invalidatedLines[i])
      }
    }
  }

  bufferDidChange(parser,tokenBuffer) {
    let p = parser;
    let tb = tokenBuffer;
    return function (e) {
      if (e.changes.length == 0) {
        return;
      }
      let invalidatedLines = p.updateChanges(e)
      for (var i = 0; i < invalidatedLines.length; i++) {
        tb.invalidateRow(invalidatedLines[i])
      }
    }
  }
}