'use babel';
import MathematicaParser from './mathematica-parser'

export default class MathematicaGrammar {
  constructor (registry) {
    this.scopeName = 'source.mathematica'
    this.name = 'Mathematica (Semantic Highlighting)'
    this.fileTypes = ['m']
    this.registry = registry
    this.maxLineLength = 10000
    this.maxTokensPerLine = 1000
    //this.tokenBuffer = tokenBuffer
    this.tokenized = false
    this.parsers = {}
    this.tokenizedBuffers = {}
    //this.setParserForBuffer(tokenBuffer.buffer)
    // this.parser = new MathematicaParser(tokenBuffer.buffer)
    //this.currentLine = 0
  }
  
  editorChanged(editor,subscriptions) {
    var editorBuffer = editor.buffer
    
    if (this.parsers[editorBuffer] instanceof MathematicaParser) {
      this.parser = this.parsers[editorBuffer]
      this.tokenBuffer = this.tokenizedBuffers[editorBuffer]
      editor.setGrammar(this)
      editor.displayLayer.setTextDecorationLayer(this.tokenizedBuffers[editorBuffer])
      //editor.tokenizedBuffer = this.tokenizedBuffers[editorBuffer]
      return
    }
    
    this.parser = new MathematicaParser(editorBuffer)
    this.parsers[editorBuffer] = this.parser
    this.tokenBuffer = editor.tokenizedBuffer
    this.tokenizedBuffers[editorBuffer] = this.tokenBuffer
    editor.setGrammar(this)
    editor.displayLayer.setTextDecorationLayer(this.tokenizedBuffers[editorBuffer])
    //editor.tokenizedBuffer = this.tokenizedBuffers[editorBuffer]
    subscriptions.add(editorBuffer.onWillChange(this.bufferWillChange.bind(this)))
    subscriptions.add(editorBuffer.onDidStopChanging(this.bufferDidChange.bind(this)))
    this.tokenize()
    //this.tokenBuffer.retokenizeLines()
    // for (var i = 0; i < editorBuffer.getLines().length; i++) {
    //   this.tokenBuffer.invalidateRow(i)
    // }
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
    var mmGrammar = this.registry.grammarForScopeName("source.mathematica")
    if (mmGrammar != null) {
      return (mmGrammar.getScore.apply(mmGrammar, arguments) + 1)
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
    //console.log(text)
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
    
    // if(this.changing) {
    //   return {line,tags,tokenArray,ruleStack}
    // }
    
    // line number from caller
    let lineNumber = this.tokenBuffer.__proto__.buildTokenizedLineForRowWithText.arguments["0"]
    
    let tokens = this.parser.tokensForLine(lineNumber)
    //console.log(lineNumber);
    
    tokens.map((token, i) => {
      //console.log(token.text);
      //console.log(token.scope);
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
    //this.tokenized = false
    this.changing = true
    //console.log("will-change")
    // this.currentLine = e.oldRange.start.row
    // console.log(this.currentLine);
  }
  
  tokenize() {
    //console.log("tokenize")
    try {
      this.parser.parse()
    } catch(ex) {
      console.log(ex);
    }
    this.tokenized = true
    
  }

  bufferDidChange(e) {
    let invalidatedLines = this.parser.updateChanges(e)
    this.changing = false
    
    for (var i = 0; i < invalidatedLines.length; i++) {
      this.tokenBuffer.invalidateRow(invalidatedLines[i])
    }
  }
  
  // this.buffer.tokenizedLineForRow = function(bufferRow) {
  //   if (0 <= bufferRow <= this.buffer.getLastRow()) {
  //     text = this.buffer.lineForRow(bufferRow)
  //     lineEnding = this.buffer.lineEndingForRow(bufferRow)
  //     tags = []
  //     tags.push(atom.grammars.startIdForScope('constant.integer'))
  //     tags.push(text.length)
  //     tags.push(atom.grammars.endIdForScope('constant.integer'))
  //     iterator =  this.buffer.tokenIterator
  //     gram = this
  //     tokenizedLine = TokenizedLine({
  //       openScopes:[],
  //       text: text,
  //       tags: tags,
  //       ruleStack: [],
  //       lineEnding: lineEnding,
  //       tokenIterator: iterator,
  //       grammar: gram
  //     })
  //     this.buffer.tokenizedLines[bufferRow] = tokenizedLine
  //     return tokenizedLine
  //   }
  // }
}