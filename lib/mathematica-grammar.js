'use babel';
import MathematicaParser from './mathematica-parser'

export default class MathematicaGrammar {
  constructor (registry) {
    this.scopeName = 'source.mathematica-semantic'
    this.name = 'Mathematica (Semantic Highlighting)'
    this.fileTypes = ['m']
    this.registry = registry
    this.maxLineLength = 10000
    this.maxTokensPerLine = 1000
    this.tokenized = false
    this.parserCache = {}
    this.parsers = {}
    this.tokenizedBuffers = {}
  }
  
  editorChanged(editor,subscriptions) {
    let editorBuffer = editor.buffer;
    let bufferID = editorBuffer.id;
    
    if (this.parserCache[bufferID] && (this.parserCache[bufferID].parser instanceof MathematicaParser)) {
      this.parser = this.parserCache[bufferID].parser;
      this.tokenBuffer = this.parserCache[bufferID].tokenizedBuffer;
      editor.setGrammar(this)
      editorBuffer.registerTextDecorationLayer(this.tokenBuffer)
      editor.displayLayer.setTextDecorationLayer(this.tokenBuffer)
      // editor.tokenizedBuffer = this.tokenBuffer
      return
    }
    
    this.parserCache[bufferID] = {}
    
    this.parser = new MathematicaParser(editorBuffer)
    this.parserCache[bufferID].parser = this.parser
    
    this.tokenBuffer = editor.tokenizedBuffer
    this.parserCache[bufferID].tokenizedBuffer = this.tokenBuffer
    editor.setGrammar(this)
    
    editorBuffer.registerTextDecorationLayer(this.tokenBuffer)
    editor.displayLayer.setTextDecorationLayer(this.tokenBuffer)
    // editor.tokenizedBuffer = this.tokenBuffer

    subscriptions.add(editorBuffer.onWillChange(this.bufferWillChange.bind(this)))
    subscriptions.add(editorBuffer.onDidStopChanging(this.bufferDidChange.bind(this)))
    this.tokenize()
  }
  
  setParserForBuffer(buffer) {
    if (!(this.parsers[buffer])) {
      this.parser = new MathematicaParser(buffer)
      return
    }
    this.parser = this.parsers[buffer]
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
    
    //TODO: handle case where text is changing (how should we highlight?)
    
    // line number from caller
    let lineNumber = this.tokenBuffer.__proto__.buildTokenizedLineForRowWithText.arguments["0"]
    
    let tokens = this.parser.tokensForLine(lineNumber)
    
    tokens.map((token, i) => {
      if (token.scope == null) {
        tags.push(token.length)
      } else {
        tags.push(this.startIdForScope(token.scope))
        tags.push(token.length)
        tags.push(this.endIdForScope(token.scope))
      }
    })
    return {line,tags,tokenArray,ruleStack}
  }
  
  bufferWillChange(e) {
    this.changing = true
  }
  
  tokenize() {
    try {
      this.parser.parse()
    } catch(ex) {
      console.log(ex);
    }
    this.tokenized = true
    
  }

  bufferDidChange(e) {
    if (e.changes.length == 0) {
      return;
    }

    let invalidatedLines = this.parser.updateChanges(e)
    this.changing = false
    
    for (var i = 0; i < invalidatedLines.length; i++) {
      this.tokenBuffer.invalidateRow(invalidatedLines[i])
    }
  }
}