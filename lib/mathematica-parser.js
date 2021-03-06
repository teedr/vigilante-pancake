'use babel';

import {TextBuffer} from 'atom'
import java from 'java'
import path from 'path' 

export default class MathematicaParser {
  constructor (buffer) {
    var javaPath = path.join(__dirname, "..", "java")
    java.classpath.push(javaPath)
    java.classpath.push(path.join(javaPath,"mexpr.jar"))
    java.classpath.push(path.join(javaPath,"antlr.jar"))
    java.classpath.push(path.join(javaPath,"mexprparser.jar"))
    java.classpath.push(path.join(javaPath,"MEET.jar"))
    java.classpath.push(path.join(javaPath,"mexprtools.jar"))
    this.parser = java.newInstanceSync("FoxySheep")
    this.builtinRegex = this.getBuiltinSymbolRegex()
    this.buffer = buffer
    this.tokenizedBuffer = buffer.getLanguageMode()
    this.unrecognizableTokenTypes = [1,4,101,115,12,14,25,26,50,51,52,64,65,100]
    this.debug = false
  }
  
  parse() {
    let bufferText = this.buffer.getText()
    java.callMethodSync(this.parser, "parseText", bufferText)
  }
  
  getErrors() {
    errors = this.parser.getErrorsSync();
    return errors;
  }
  
  tokenizeChanges(e) {
    
    let invalidLines = [];
    let bufferText = this.buffer.getText();
        
    e.changes.map(function(change) {
      let invalid = this.tokenizeChange(change,bufferText);
      invalidLines = invalidLines.concat(invalid);
    }, this);
    
    return invalidLines;
  }
  
  parseChanges(e) {
    
    let invalidLines = [];
    let bufferText = this.buffer.getText();
    e.changes.map(function(change) {
      let invalid = this.parseChange(change,bufferText);
      invalidLines = invalidLines.concat(invalid);
    }, this);
    
    return invalidLines;
  }
  
  tokenizeChange(change, bufferText) {
    console.log("start tokenize");
    let startPoint = change.newRange.start
    let endPoint = change.newRange.end
    
    let startIndex = this.buffer.characterIndexForPosition(startPoint)
    let endIndex = this.buffer.characterIndexForPosition(startPoint)
    if (this.debug) {
      console.log(["change:",change]);
    }
    let length = change.oldText.length;
    
    let oldToken = this.parser.getTokenForOffsetSync(endIndex);
    let oldTokenEndRow = -1;
    if (oldToken != null) {
      oldTokenEndRow = (this.buffer.positionForCharacterIndex(oldToken.end).row);
    }
    console.log(oldTokenEndRow);
    this.parser.tokenizeChangeSync(bufferText, startIndex, length, change.newText, false)
        
    let invalidatedLines = []
    
    let invalidStartRow = startPoint.row;
    let invalidEndRow = endPoint.row;
    
    var endRow = Math.max(oldTokenEndRow,invalidEndRow);
    
    for (var i = invalidStartRow; i <= endRow; i++) {
      invalidatedLines.push(i)
    }
    if (this.debug) {
      console.log(["invalidated lines:",invalidatedLines]);
    }
    this.unparsedLines = invalidatedLines;
    console.log("end tokenize");    
    return invalidatedLines;
  }
  
  parseChange(change) {
    console.log("start parse");
    let startPoint = change.newRange.start
    let endPoint = change.newRange.end
    
    let startIndex = this.buffer.characterIndexForPosition(startPoint)    
    let length = change.oldText.length;
    
    var changedRegion = this.parser.parseChangeSync(startIndex, length, change.newText)
    
    if (changedRegion[0] == -1) {
      if (this.unparsedLines && this.unparsedLines.length > 0) {
        let unparsed = this.unparsedLines;
        this.unparsedLines = [];
        return unparsed;
      } else {
        return[];
      }
    }
    
    var rootStartRow = this.buffer.positionForCharacterIndex(changedRegion[0]).row
    var rootEndRow = this.buffer.positionForCharacterIndex(changedRegion[1]).row

    var invalidatedScopeLines = []
    for (var i = rootStartRow; i < rootEndRow; i++) {
      invalidatedScopeLines.push(i)
    }
    
    if (this.debug) {
      console.log(["invalidated scope lines:",invalidatedScopeLines]);
    }
    
    let allLines = invalidatedScopeLines;
    if (this.unparsedLines && this.unparsedLines.length > 0) {
      allLines = invalidatedScopeLines.concat(this.unparsedLines);
    } else {
      allLines = invalidatedScopeLines;
    }
    
    let uniqueLines = allLines.filter(function(item, pos) {
      return allLines.indexOf(item) == pos;
    })
    
    this.unparsedLines = [];
    
    console.log("end parse");
    return uniqueLines
  }
    
  tokensForLine(line) {
        
    let lineRange = this.buffer.rangeForRow(line)
    let lineStartIndex = this.buffer.characterIndexForPosition(lineRange.start)
    let lineEndIndex = this.buffer.characterIndexForPosition(lineRange.end)
    
    if (lineEndIndex-lineStartIndex == 0 ) {
      return []
    }
    let tokens = [];
    tokens = this.parser.getAtomTokensForRangeSync(lineStartIndex,lineEndIndex);
    let tokensOnLine = tokens.filter(function (tok) {
      return !this.unrecognizableTokenTypes.includes(tok.scopeInt) && tok.text != null && tok.start < lineEndIndex
    },this);

    if (tokensOnLine.length == 0) {
      return tokensOnLine
    }
    
    let lineTokens = []
    
    tokensOnLine.map(function (token, i) {
      
      let newTokens = []
      let tokStart = null
      let tokEnd = null
      
      if (token.start < lineStartIndex) {
        tokStart = lineStartIndex
      } else {
        tokStart = token.start
      }
      
      if (token.end > lineEndIndex) {
        // Add 1 because we must include the length of the final token
        // ie: (token start == last token end) so the token at the end of a line
        // must extend to the end of the "next token" (which does not exist in this case)
        tokEnd = (lineEndIndex + 1)
      } else {
        tokEnd = token.end
      }
      
      // if this is the first token on the line and the token's start
      // is not the line's start, there is whitespace between the start of line
      // and the start of token that we must add to the token array
      if (lineTokens.length == 0 && lineStartIndex!=tokStart) {
        newTokens.push({
          charStart: lineStartIndex,
          // Do not include first character of token (so subtract 1)
          charEnd: tokStart,
          length: (tokStart - lineStartIndex),
          scope: null
        })
      }
      
      // if last token's end is not current token's stat, add whitespace padding
      if (lineTokens.length > 0 && lineTokens[lineTokens.length-1].charEnd!=tokStart) {
        newTokens.push({
          charStart: lineTokens[lineTokens.length-1].charEnd,
          charEnd: tokStart,
          length: (tokStart - lineTokens[lineTokens.length-1].charEnd),
          scope: null
        })
      }
      
      let scoped = token.scopedVar
      if (tokStart != tokEnd) {
        newTokens.push({
          charStart: tokStart,
          charEnd: tokEnd,
          length: (tokEnd - tokStart),
          text: token.text,
          scope: this.typeToScope(token,scoped)
        })
      }
      
      lineTokens = lineTokens.concat(newTokens)
      
    }, this)
    
    return lineTokens
  }
  
  typeToScope(token,scoped) {
    //lookup for type integer to atom scope
    
    if (scoped) {
      return 'variable.parameter.function'
    }
    
    if (this.builtinRegex.test(token.text)) {
      return 'keyword.function.builtin'
    }
    
    let scope = null;
    
    switch (token.scopeInt) {
      //EOF = 1;
      //NULL_TREE_LOOKAHEAD = 3;
      //PACKAGE = 4;
      //SEMI = 5;
      case 5:
        scope = 'punctuation.terminator.statement';
        break;
      //PUT = 6;
      //SET = 7;
      case 7:
      //SETDELAYED = 8;
      case 8:
      //UPSET = 9;
      case 9:
      //UPSETDELAYED = 10;
      case 10:
      //TAGSET = 11;
      case 11:
        scope = 'keyword.operator.assignment';
        break;
      //UNSETINFIX = 12;
      //SLASHFUN = 13;
      //AMPINFIX = 14;
      //ADDTO = 15;
      //SUBTRACTFROM = 16;
      //TIMESBY = 17;
      //DIVIDEBY = 18;
      //REPLACEALL = 19;
      //REPLACEREPEATED = 20;
      //RULE = 21;
      case 21:
        scope = 'constant.symbol';
        break;
      //CONDITION = 22;
      //STRINGEXPRESSION = 23;
      //ALTERNATIVES = 24;
      //REPEATEDINFIX = 25;
      //REPEATEDNULLINFIX = 26;
      //OR = 27;
      case 27:
      //AND = 28;
      case 28:
        scope = 'keyword.operator.logical';
        break;
      //SAMEQ = 29;
      //UNSAMEQ = 30;
      //EQUAL = 31;
      case 31:
      //UNEQUAL = 32;
      case 32:
      //GREATER = 33;
      case 33:
      //LESS = 34;
      case 34:
      //GREATEREQUAL = 35;
      case 35:
      //LESSEQUAL = 36;
      case 36:
        scope = 'keyword.operator.comparison';
        break;
      //UNDIRECTEDEDGE = 37;
      //SEMISEMI = 38;
      //PLUS = 39;
      case 39:
      //MINUS = 40;
      case 40:
      //TIMES = 41;
      case 41:
      //SLASH = 42;
      case 42:
      //TYPESETDIVIDE = 43;
      case 43:
        scope = 'keyword.operator.arithmetic';
        break;
      //DOT = 44;
      //NONCOMMUTE = 45;
      //CARET = 46;
      //TYPESETSUPER = 47;
      //TYPESETSQRT = 48;
      //STRINGJOIN = 49;
      //DERIVATIVEINFIX = 50;
      //NOTINFIX = 51;
      //NOTNOTINFIX = 52;
      //MAP = 53;
      case 53:
      //MAPALL = 54;
      case 54:
      //APPLY = 55;
      case 55:
      //APPLYONE = 56;
      case 56:
        scope = 'keyword.operator';
        break;
      //INFIXFULLFORM = 57;
      //ATFUN = 58;
      //RIGHTCOMPOSITION = 59;
      //COMPOSITION = 60;
      //PLUSPLUS = 61;
      //MINUSMINUS = 62;
      //TYPESETFULLFORM = 63;
      //PLUSPLUSINFIX = 64;
      //MINUSMINUSINFIX = 65;
      //QUESTION = 66;
      //MESSAGENAME = 67;
      //NOT = 68;
      case 68:
      //NOTNOT = 69;
      case 69:
        scope = 'keyword.operator.logical';
        break;
      //UNARYMINUS = 70;
      //UNARYPLUS = 71;
      //LDOUBLEBRACKET = 72;
      case 72:
      //RDOUBLEBRACKET = 73;
      case 73:
      //LBRACKET = 74;
      case 74:
      //RBRACKET = 75;
      case 75:
        scope = 'meta.brace';
        break;
      //TYPESETCLOSE = 76;
      //COMMA = 77;
      case 77:
        scope = 'meta.delimiter.object.comma';
        break;
      //LPAREN = 78;
      case 78:
      //RPAREN = 79;
      case 79:
      //TYPESETOPEN = 80;
      //TYPESETSUB = 81;
      //LBRACE = 82;
      case 82:
      //RBRACE = 83;
      case 83:
        scope = 'meta.brace';
        break;
      //LCOLLECT = 84;
      //RCOLLECT = 85;
      //ID = 86;
      case 86:
        scope = 'entity.name.function';
        break;
      //COLON = 87;
      //IDBLANK1 = 88;
      //IDBLANK2 = 89;
      //IDBLANK3 = 90;
      //IDBLANKDOT = 91;
      //IDBLANKID1 = 92;
      //IDBLANKID2 = 93;
      //IDBLANKID3 = 94;
      //EXPRATOM = 95;
      //EXPRATOMPREFIX = 96;
      //INT = 97;
      case 97:
      //REAL = 98;
      case 98:
        scope = 'constant.integer';
        break;
      //STRING = 99;
      case 99:
        scope = 'string.quoted.double';
        break;
      //POSTFIXID = 100;
      //NULLID = 101;
      case 101:
        scope = 'constant.language.null';
        break;
      //ERROR = 102;
      case 102:
        scope = 'invalid.illegal';
        break;
      //BLANKDOT = 103;
      //SLOT = 104;
      //TYPESETEXPR = 105;
      //PERCENT = 106;
      //PERCENTNUMBER = 107;
      //IDSEMISEMIID = 108;
      //BLANK1 = 109;
      //BLANK2 = 110;
      //BLANK3 = 111;
      //BLANKID1 = 112;
      //BLANKID2 = 113;
      //BLANKID3 = 114;
      //WARNINGTOKEN = 115;
      //INFORMATION1 = 116;
      //INFORMATION2 = 117;
      //DERIVATIVE = 118;
      //SEMI_START = 119;
      //SLASH_START = 120;
      //EQUAL_START = 121;
      //EQUALEXCLAM = 122;
      //UNSET = 123;
      //AT_START = 124;
      //PLUS_START = 125;
      //MINUS_START = 126;
      //EXCLAM = 127;
      //EXCLAM2 = 128;
      //EXCLAM_START = 129;
      //COLON_START = 130;
      //CARET_START = 131;
      //GREATER_START = 132;
      //LESS_START = 133;
      //AMP_START = 134;
      //AMP = 135;
      //BAR_START = 136;
      //TILDE_START = 137;
      //STAR_START = 138;
      //WHITESPACE = 139;
      //COMMENT = 140;
      case 140:
        scope = 'comment';
        break;
      //INT_REAL_DOT = 141;
      //DOT_START = 142;
      //REPEATED = 143;
      //REPEATEDNULL = 144;
      //BLANK = 145;
      //IDBACK = 146;
      //IDUNICODESTART = 147;
      //LONGNAME = 148;
      //BACKSLASH_START = 149;
      //BACKSLASHBRACKET = 150;
      //TYPESETSPACE = 151;
      //DUMMYID = 152;
      default:
        scope = 'keyword.operator'
    }

    return scope
  }
  
  getBuiltinSymbolRegex() {
    re = new RegExp("^(AASTriangle|AbelianGroup|Abort|AbortKernels|AbortProtect|Above|Abs|AbsArg|Absolute|AbsoluteCorrelation|AbsoluteCorrelationFunction|AbsoluteCurrentValue|AbsoluteDashing|AbsoluteFileName|AbsoluteOptions|AbsolutePointSize|AbsoluteThickness|AbsoluteTime|AbsoluteTiming|AccountingForm|Accumulate|Accuracy|AccuracyGoal|ActionDelay|ActionMenu|ActionMenuBox|ActionMenuBoxOptions|Activate|Active|ActiveItem|ActiveStyle|AcyclicGraphQ|AddOnHelpPath|AddTo|AddUsers|AdjacencyGraph|AdjacencyList|AdjacencyMatrix|AdjustmentBox|AdjustmentBoxOptions|AdjustTimeSeriesForecast|AdministrativeDivisionData|AffineStateSpaceModel|AffineTransform|After|AircraftData|AirportData|AirPressureData|AirTemperatureData|AiryAi|AiryAiPrime|AiryAiZero|AiryBi|AiryBiPrime|AiryBiZero|AlgebraicIntegerQ|AlgebraicNumber|AlgebraicNumberDenominator|AlgebraicNumberNorm|AlgebraicNumberPolynomial|AlgebraicNumberTrace|AlgebraicRules|AlgebraicRulesData|Algebraics|AlgebraicUnitQ|Alignment|AlignmentMarker|AlignmentPoint|All|AllowedDimensions|AllowedHeads|AllowGroupClose|AllowIncomplete|AllowInlineCells|AllowKernelInitialization|AllowLooseGrammar|AllowReverseGroupClose|AllowScriptLevelChange|AllowTransliteration|AllTrue|Alphabet|AlphaChannel|AlternateImage|AlternatingFactorial|AlternatingGroup|AlternativeHypothesis|Alternatives|AltitudeMethod|AmbientLight|AmbiguityFunction|AmbiguityList|Analytic|AnchoredSearch|And|AndersonDarlingTest|AngerJ|AngleBracket|AnglePath|AngleVector|AngularGauge|Animate|AnimationCycleOffset|AnimationCycleRepetitions|AnimationDirection|AnimationDisplayTime|AnimationRate|AnimationRepetitions|AnimationRunning|AnimationRunTime|AnimationTimeIndex|Animator|AnimatorBox|AnimatorBoxOptions|AnimatorElements|Annotation|Annuity|AnnuityDue|Antialiasing|AntihermitianMatrixQ|Antisymmetric|AntisymmetricMatrixQ|AnyOrder|AnySubset|AnyTrue|Apart|ApartSquareFree|APIFunction|Appearance|AppearanceElements|AppearanceRules|AppellF1|Append|AppendTo|Apply|ArcCos|ArcCosh|ArcCot|ArcCoth|ArcCsc|ArcCsch|ArcCurvature|ARCHProcess|ArcLength|ArcSec|ArcSech|ArcSin|ArcSinDistribution|ArcSinh|ArcTan|ArcTanh|Area|Arg|ArgMax|ArgMin|ArgumentCountQ|ARIMAProcess|ArithmeticGeometricMean|ARMAProcess|ARProcess|Array|ArrayComponents|ArrayDepth|ArrayFlatten|ArrayPad|ArrayPlot|ArrayQ|ArrayResample|ArrayReshape|ArrayRules|Arrays|Arrow|Arrow3DBox|ArrowBox|Arrowheads|ASATriangle|AspectRatio|AspectRatioFixed|Assert|AssociateTo|Association|AssociationFormat|AssociationMap|AssociationQ|AssociationThread|Assuming|Assumptions|AstronomicalData|AsymptoticOutputTracker|Asynchronous|AsynchronousTaskObject|AsynchronousTasks|AtomQ|Attributes|AugmentedSymmetricPolynomial|AutoAction|AutocorrelationTest|AutoDelete|AutoEvaluateEvents|AutoGeneratedPackage|AutoIndent|AutoIndentSpacings|AutoItalicWords|AutoloadPath|AutoMatch|AutomaticImageSize|AutoMultiplicationSymbol|AutoNumberFormatting|AutoOpenNotebooks|AutoOpenPalettes|AutoRemove|AutorunSequencing|AutoScaling|AutoScroll|AutoSpacing|AutoStyleOptions|AutoStyleWords|AutoSubmitting|Axes|AxesEdge|AxesLabel|AxesOrigin|AxesStyle|Axis|BabyMonsterGroupB|Back|Background|BackgroundTasksSettings|Backslash|Backsubstitution|Backward|Ball|Band|BandpassFilter|BandstopFilter|BarabasiAlbertGraphDistribution|BarChart|BarChart3D|BarcodeImage|BarcodeRecognize|BarLegend|BarlowProschanImportance|BarnesG|BarOrigin|BarSpacing|BartlettHannWindow|BartlettWindow|BaseForm|Baseline|BaselinePosition|BaseStyle|BatesDistribution|BattleLemarieWavelet|Because|BeckmannDistribution|Beep|Before|Begin|BeginDialogPacket|BeginFrontEndInteractionPacket|BeginPackage|BellB|BellY|Below|BenfordDistribution|BeniniDistribution|BenktanderGibratDistribution|BenktanderWeibullDistribution|BernoulliB|BernoulliDistribution|BernoulliGraphDistribution|BernoulliProcess|BernsteinBasis|BesselFilterModel|BesselI|BesselJ|BesselJZero|BesselK|BesselY|BesselYZero|Beta|BetaBinomialDistribution|BetaDistribution|BetaNegativeBinomialDistribution|BetaPrimeDistribution|BetaRegularized|BetweennessCentrality|BezierCurve|BezierCurve3DBox|BezierCurve3DBoxOptions|BezierCurveBox|BezierCurveBoxOptions|BezierFunction|BilateralFilter|Binarize|BinaryFormat|BinaryImageQ|BinaryRead|BinaryReadList|BinaryWrite|BinCounts|BinLists|Binomial|BinomialDistribution|BinomialProcess|BinormalDistribution|BiorthogonalSplineWavelet|BipartiteGraphQ|BirnbaumImportance|BirnbaumSaundersDistribution|BitAnd|BitClear|BitGet|BitLength|BitNot|BitOr|BitSet|BitShiftLeft|BitShiftRight|BitXor|Black|BlackmanHarrisWindow|BlackmanNuttallWindow|BlackmanWindow|Blank|BlankForm|BlankNullSequence|BlankSequence|Blend|Block|BlockRandom|BlomqvistBeta|BlomqvistBetaTest|Blue|Blur|BodePlot|BohmanWindow|Bold|Bookmarks|Boole|BooleanConsecutiveFunction|BooleanConvert|BooleanCountingFunction|BooleanFunction|BooleanGraph|BooleanMaxterms|BooleanMinimize|BooleanMinterms|BooleanQ|BooleanRegion|Booleans|BooleanStrings|BooleanTable|BooleanVariables|BorderDimensions|BorelTannerDistribution|Bottom|BottomHatTransform|BoundaryDiscretizeGraphics|BoundaryDiscretizeRegion|BoundaryMesh|BoundaryMeshRegion|BoundaryMeshRegionQ|BoundaryStyle|BoundedRegionQ|Bounds|Box|BoxBaselineShift|BoxData|BoxDimensions|Boxed|Boxes|BoxForm|BoxFormFormatTypes|BoxFrame|BoxID|BoxMargins|BoxMatrix|BoxObject|BoxRatios|BoxRotation|BoxRotationPoint|BoxStyle|BoxWhiskerChart|Bra|BracketingBar|BraKet|BrayCurtisDistance|BreadthFirstScan|Break|BridgeData|BroadcastStationData|Brown|BrownForsytheTest|BrownianBridgeProcess|BrowserCategory|BSplineBasis|BSplineCurve|BSplineCurve3DBox|BSplineCurve3DBoxOptions|BSplineCurveBox|BSplineCurveBoxOptions|BSplineFunction|BSplineSurface|BSplineSurface3DBox|BSplineSurface3DBoxOptions|BubbleChart|BubbleChart3D|BubbleScale|BubbleSizes|BuildingData|BulletGauge|BusinessDayQ|ButterflyGraph|ButterworthFilterModel|Button|ButtonBar|ButtonBox|ButtonBoxOptions|ButtonCell|ButtonContents|ButtonData|ButtonEvaluator|ButtonExpandable|ButtonFrame|ButtonFunction|ButtonMargins|ButtonMinHeight|ButtonNote|ButtonNotebook|ButtonSource|ButtonStyle|ButtonStyleMenuListing|Byte|ByteArray|ByteArrayQ|ByteCount|ByteOrdering|C|CachedValue|CacheGraphics|CalendarConvert|CalendarData|CalendarType|CallPacket|CanberraDistance|Cancel|CancelButton|CandlestickChart|CanonicalGraph|CanonicalName|CantorStaircase|Cap|CapForm|CapitalDifferentialD|Capitalize|CardinalBSplineBasis|CarlemanLinearize|CarmichaelLambda|Cases|CaseSensitive|Cashflow|Casoratian|Catalan|CatalanNumber|Catch|Catenate|CauchyDistribution|CauchyWindow|CayleyGraph|CDF|CDFDeploy|CDFInformation|CDFWavelet|Ceiling|CelestialSystem|Cell|CellAutoOverwrite|CellBaseline|CellBoundingBox|CellBracketOptions|CellChangeTimes|CellContents|CellContext|CellDingbat|CellDynamicExpression|CellEditDuplicate|CellElementsBoundingBox|CellElementSpacings|CellEpilog|CellEvaluationDuplicate|CellEvaluationFunction|CellEventActions|CellFrame|CellFrameColor|CellFrameLabelMargins|CellFrameLabels|CellFrameMargins|CellGroup|CellGroupData|CellGrouping|CellGroupingRules|CellHorizontalScrolling|CellID|CellLabel|CellLabelAutoDelete|CellLabelMargins|CellLabelPositioning|CellMargins|CellObject|CellOpen|CellPrint|CellProlog|Cells|CellSize|CellStyle|CellTags|CellularAutomaton|CensoredDistribution|Censoring|Center|CenterDot|CentralMoment|CentralMomentGeneratingFunction|CForm|ChampernowneNumber|ChanVeseBinarize|Character|CharacterCounts|CharacterEncoding|CharacterEncodingsPath|CharacteristicFunction|CharacteristicPolynomial|CharacterRange|Characters|ChartBaseStyle|ChartElementData|ChartElementDataFunction|ChartElementFunction|ChartElements|ChartLabels|ChartLayout|ChartLegends|ChartStyle|Chebyshev1FilterModel|Chebyshev2FilterModel|ChebyshevDistance|ChebyshevT|ChebyshevU|Check|CheckAbort|CheckAll|Checkbox|CheckboxBar|CheckboxBox|CheckboxBoxOptions|ChemicalData|ChessboardDistance|ChiDistribution|ChineseRemainder|ChiSquareDistribution|ChoiceButtons|ChoiceDialog|CholeskyDecomposition|Chop|ChromaticityPlot|ChromaticityPlot3D|ChromaticPolynomial|Circle|CircleBox|CircleDot|CircleMinus|CirclePlus|CirclePoints|CircleTimes|CirculantGraph|Circumsphere|CityData|ClassifierFunction|ClassifierInformation|ClassifierMeasurements|ClassifierMeasurementsObject|Classify|ClassPriors|Clear|ClearAll|ClearAttributes|ClearSystemCache|ClebschGordan|ClickPane|Clip|ClipboardNotebook|ClipFill|ClippingStyle|ClipPlanes|ClipPlanesStyle|ClipRange|Clock|ClockGauge|ClockwiseContourIntegral|Close|Closed|CloseKernels|ClosenessCentrality|Closing|ClosingAutoSave|ClosingEvent|CloudAccountData|CloudBase|CloudConnect|CloudDeploy|CloudDirectory|CloudDisconnect|CloudEvaluate|CloudExport|CloudFunction|CloudGet|CloudImport|CloudObject|CloudObjectInformation|CloudObjectInformationData|CloudObjects|CloudPut|CloudSave|CloudSymbol|ClusteringComponents|CMYKColor|Coarse|CodeAssistOptions|Coefficient|CoefficientArrays|CoefficientDomain|CoefficientList|CoefficientRules|CoifletWavelet|Collect|Colon|ColonForm|ColorCombine|ColorConvert|ColorCoverage|ColorData|ColorDataFunction|ColorDistance|ColorFunction|ColorFunctionScaling|Colorize|ColorNegate|ColorOutput|ColorProfileData|ColorQ|ColorQuantize|ColorReplace|ColorRules|ColorSelectorSettings|ColorSeparate|ColorSetter|ColorSetterBox|ColorSetterBoxOptions|ColorSlider|ColorSpace|Column|ColumnAlignments|ColumnBackgrounds|ColumnForm|ColumnLines|ColumnsEqual|ColumnSpacings|ColumnSpans|ColumnWidths|CombinerFunction|CometData|CommonDefaultFormatTypes|Commonest|CommonestFilter|CommonName|CommonUnits|CommunityBoundaryStyle|CommunityGraphPlot|CommunityLabels|CommunityRegionStyle|CompanyData|CompatibleUnitQ|CompilationOptions|CompilationTarget|Compile|Compiled|CompiledFunction|Complement|CompleteGraph|CompleteGraphQ|CompleteKaryTree|CompletionsListPacket|Complex|Complexes|ComplexExpand|ComplexInfinity|ComplexityFunction|ComponentMeasurements|ComponentwiseContextMenu|Compose|ComposeList|ComposeSeries|CompositeQ|Composition|CompoundElement|CompoundExpression|CompoundPoissonDistribution|CompoundPoissonProcess|CompoundRenewalProcess|Compress|CompressedData|Condition|ConditionalExpression|Conditioned|Cone|ConeBox|ConfidenceLevel|ConfidenceRange|ConfidenceTransform|ConfigurationPath|ConformImages|Congruent|ConicHullRegion|ConicHullRegion3DBox|ConicHullRegionBox|Conjugate|ConjugateTranspose|Conjunction|Connect|ConnectedComponents|ConnectedGraphQ|ConnectedMeshComponents|ConnectLibraryCallbackFunction|ConnesWindow|ConoverTest|ConsoleMessage|ConsoleMessagePacket|ConsolePrint|Constant|ConstantArray|ConstantImage|ConstantRegionQ|Constants|ConstellationData|ConstrainedMax|ConstrainedMin|ContentPadding|ContentsBoundingBox|ContentSelectable|ContentSize|Context|ContextMenu|Contexts|ContextToFilename|ContextToFileName|Continuation|Continue|ContinuedFraction|ContinuedFractionK|ContinuousAction|ContinuousMarkovProcess|ContinuousTimeModelQ|ContinuousWaveletData|ContinuousWaveletTransform|ContourDetect|ContourGraphics|ContourIntegral|ContourLabels|ContourLines|ContourPlot|ContourPlot3D|Contours|ContourShading|ContourSmoothing|ContourStyle|ContraharmonicMean|Control|ControlActive|ControlAlignment|ControllabilityGramian|ControllabilityMatrix|ControllableDecomposition|ControllableModelQ|ControllerDuration|ControllerInformation|ControllerInformationData|ControllerLinking|ControllerManipulate|ControllerMethod|ControllerPath|ControllerState|ControlPlacement|ControlsRendering|ControlType|Convergents|ConversionOptions|ConversionRules|ConvertToBitmapPacket|ConvertToPostScript|ConvertToPostScriptPacket|ConvexHullMesh|Convolve|ConwayGroupCo1|ConwayGroupCo2|ConwayGroupCo3|CoordinateBoundingBox|CoordinateBoundingBoxArray|CoordinateBounds|CoordinateBoundsArray|CoordinateChartData|CoordinatesToolOptions|CoordinateTransform|CoordinateTransformData|CoprimeQ|Coproduct|CopulaDistribution|Copyable|CopyDatabin|CopyDirectory|CopyFile|CopyTag|CopyToClipboard|CornerFilter|CornerNeighbors|Correlation|CorrelationDistance|CorrelationFunction|CorrelationTest|Cos|Cosh|CoshIntegral|CosineDistance|CosineWindow|CosIntegral|Cot|Coth|Count|CountDistinct|CountDistinctBy|CounterAssignments|CounterBox|CounterBoxOptions|CounterClockwiseContourIntegral|CounterEvaluator|CounterFunction|CounterIncrements|CounterStyle|CounterStyleMenuListing|CountRoots|CountryData|Counts|CountsBy|Covariance|CovarianceEstimatorFunction|CovarianceFunction|CoxianDistribution|CoxIngersollRossProcess|CoxModel|CoxModelFit|CramerVonMisesTest|CreateArchive|CreateCellID|CreateDatabin|CreateDialog|CreateDirectory|CreateDocument|CreateIntermediateDirectories|CreateManagedLibraryExpression|CreateNotebook|CreatePalette|CreatePalettePacket|CreatePermissionsGroup|CreateScheduledTask|CreateTemporary|CreateUUID|CreateWindow|CriticalityFailureImportance|CriticalitySuccessImportance|CriticalSection|Cross|CrossingDetect|CrossMatrix|Csc|Csch|CubeRoot|Cubics|Cuboid|CuboidBox|Cumulant|CumulantGeneratingFunction|Cup|CupCap|Curl|CurlyDoubleQuote|CurlyQuote|CurrencyConvert|CurrentImage|CurrentlySpeakingPacket|CurrentValue|CurvatureFlowFilter|CurveClosed|Cyan|CycleGraph|CycleIndexPolynomial|Cycles|CyclicGroup|Cyclotomic|Cylinder|CylinderBox|CylindricalDecomposition|D|DagumDistribution|DamData|DamerauLevenshteinDistance|DampingFactor|Darker|Dashed|Dashing|Databin|DatabinAdd|Databins|DatabinUpload|DataCompression|DataDistribution|DataRange|DataReversed|Dataset|Date|DateDelimiters|DateDifference|DatedUnit|DateFormat|DateFunction|DateList|DateListLogPlot|DateListPlot|DateObject|DateObjectQ|DatePattern|DatePlus|DateRange|DateString|DateTicksFormat|DateValue|DaubechiesWavelet|DavisDistribution|DawsonF|DayCount|DayCountConvention|DayHemisphere|DaylightQ|DayMatchQ|DayName|DayNightTerminator|DayPlus|DayRange|DayRound|DeBruijnGraph|Debug|DebugTag|Decapitalize|Decimal|DeclareKnownSymbols|DeclarePackage|Decompose|Decrement|Decrypt|DedekindEta|DeepSpaceProbeData|Default|DefaultAxesStyle|DefaultBaseStyle|DefaultBoxStyle|DefaultButton|DefaultColor|DefaultControlPlacement|DefaultDuplicateCellStyle|DefaultDuration|DefaultElement|DefaultFaceGridsStyle|DefaultFieldHintStyle|DefaultFont|DefaultFontProperties|DefaultFormatType|DefaultFormatTypeForStyle|DefaultFrameStyle|DefaultFrameTicksStyle|DefaultGridLinesStyle|DefaultInlineFormatType|DefaultInputFormatType|DefaultLabelStyle|DefaultMenuStyle|DefaultNaturalLanguage|DefaultNewCellStyle|DefaultNewInlineCellStyle|DefaultNotebook|DefaultOptions|DefaultOutputFormatType|DefaultStyle|DefaultStyleDefinitions|DefaultTextFormatType|DefaultTextInlineFormatType|DefaultTicksStyle|DefaultTooltipStyle|DefaultValue|DefaultValues|Defer|DefineExternal|DefineInputStreamMethod|DefineOutputStreamMethod|Definition|Degree|DegreeCentrality|DegreeGraphDistribution|DegreeLexicographic|DegreeReverseLexicographic|Deinitialization|Del|DelaunayMesh|Delayed|Deletable|Delete|DeleteBorderComponents|DeleteCases|DeleteContents|DeleteDirectory|DeleteDuplicates|DeleteDuplicatesBy|DeleteFile|DeleteMissing|DeleteSmallComponents|DeleteStopwords|DeleteWithContents|DeletionWarning|DelimitedSequence|Delimiter|DelimiterFlashTime|DelimiterMatching|Delimiters|DeliveryFunction|Denominator|DensityGraphics|DensityHistogram|DensityPlot|DependentVariables|Deploy|Deployed|Depth|DepthFirstScan|Derivative|DerivativeFilter|DescriptorStateSpace|DesignMatrix|DestroyAfterEvaluation|Det|DeviceClose|DeviceConfigure|DeviceExecute|DeviceExecuteAsynchronous|DeviceObject|DeviceOpen|DeviceOpenQ|DeviceRead|DeviceReadBuffer|DeviceReadLatest|DeviceReadList|DeviceReadTimeSeries|Devices|DeviceStreams|DeviceWrite|DeviceWriteBuffer|DGaussianWavelet|DiacriticalPositioning|Diagonal|DiagonalizableMatrixQ|DiagonalMatrix|Dialog|DialogIndent|DialogInput|DialogLevel|DialogNotebook|DialogProlog|DialogReturn|DialogSymbols|Diamond|DiamondMatrix|DiceDissimilarity|DictionaryLookup|DifferenceDelta|DifferenceOrder|DifferenceRoot|DifferenceRootReduce|Differences|DifferentialD|DifferentialRoot|DifferentialRootReduce|DifferentiatorFilter|DigitBlock|DigitBlockMinimum|DigitCharacter|DigitCount|DigitQ|DihedralGroup|Dilation|DimensionalCombinations|DimensionalMeshComponents|DimensionReduce|DimensionReducerFunction|DimensionReduction|Dimensions|DiracComb|DiracDelta|DirectedEdge|DirectedEdges|DirectedGraph|DirectedGraphQ|DirectedInfinity|Direction|Directive|Directory|DirectoryName|DirectoryQ|DirectoryStack|DirichletBeta|DirichletCharacter|DirichletCondition|DirichletConvolve|DirichletDistribution|DirichletEta|DirichletL|DirichletLambda|DirichletTransform|DirichletWindow|DisableConsolePrintPacket|DiscreteChirpZTransform|DiscreteConvolve|DiscreteDelta|DiscreteHadamardTransform|DiscreteIndicator|DiscreteLQEstimatorGains|DiscreteLQRegulatorGains|DiscreteLyapunovSolve|DiscreteMarkovProcess|DiscretePlot|DiscretePlot3D|DiscreteRatio|DiscreteRiccatiSolve|DiscreteShift|DiscreteTimeModelQ|DiscreteUniformDistribution|DiscreteVariables|DiscreteWaveletData|DiscreteWaveletPacketTransform|DiscreteWaveletTransform|DiscretizeGraphics|DiscretizeRegion|Discriminant|DisjointQ|Disjunction|Disk|DiskBox|DiskMatrix|Dispatch|DispatchQ|DispersionEstimatorFunction|Display|DisplayAllSteps|DisplayEndPacket|DisplayFlushImagePacket|DisplayForm|DisplayFunction|DisplayPacket|DisplayRules|DisplaySetSizePacket|DisplayString|DisplayTemporary|DisplayWith|DisplayWithRef|DisplayWithVariable|DistanceFunction|DistanceTransform|Distribute|Distributed|DistributedContexts|DistributeDefinitions|DistributionChart|DistributionDomain|DistributionFitTest|DistributionParameterAssumptions|DistributionParameterQ|Dithering|Div|Divergence|Divide|DivideBy|Dividers|Divisible|Divisors|DivisorSigma|DivisorSum|DMSList|DMSString|Do|DockedCells|DocumentGenerator|DocumentGeneratorInformation|DocumentGeneratorInformationData|DocumentGenerators|DocumentNotebook|DominantColors|DOSTextFormat|Dot|DotDashed|DotEqual|Dotted|DoubleBracketingBar|DoubleContourIntegral|DoubleDownArrow|DoubleLeftArrow|DoubleLeftRightArrow|DoubleLeftTee|DoubleLongLeftArrow|DoubleLongLeftRightArrow|DoubleLongRightArrow|DoubleRightArrow|DoubleRightTee|DoubleUpArrow|DoubleUpDownArrow|DoubleVerticalBar|DoublyInfinite|Down|DownArrow|DownArrowBar|DownArrowUpArrow|DownLeftRightVector|DownLeftTeeVector|DownLeftVector|DownLeftVectorBar|DownRightTeeVector|DownRightVector|DownRightVectorBar|Downsample|DownTee|DownTeeArrow|DownValues|DragAndDrop|DrawEdges|DrawFrontFaces|DrawHighlighted|Drop|DSolve|DSolveValue|Dt|DualLinearProgramming|DualSystemsModel|DumpGet|DumpSave|DuplicateFreeQ|Dynamic|DynamicBox|DynamicBoxOptions|DynamicEvaluationTimeout|DynamicGeoGraphics|DynamicLocation|DynamicModule|DynamicModuleBox|DynamicModuleBoxOptions|DynamicModuleParent|DynamicModuleValues|DynamicName|DynamicNamespace|DynamicReference|DynamicSetting|DynamicUpdating|DynamicWrapper|DynamicWrapperBox|DynamicWrapperBoxOptions|E|EarthImpactData|EarthquakeData|EccentricityCentrality|EclipseType|EdgeAdd|EdgeBetweennessCentrality|EdgeCapacity|EdgeCapForm|EdgeColor|EdgeConnectivity|EdgeContract|EdgeCost|EdgeCount|EdgeCoverQ|EdgeCycleMatrix|EdgeDashing|EdgeDelete|EdgeDetect|EdgeForm|EdgeIndex|EdgeJoinForm|EdgeLabeling|EdgeLabels|EdgeLabelStyle|EdgeList|EdgeOpacity|EdgeQ|EdgeRenderingFunction|EdgeRules|EdgeShapeFunction|EdgeStyle|EdgeThickness|EdgeWeight|Editable|EditButtonSettings|EditCellTagsSettings|EditDistance|EffectiveInterest|Eigensystem|Eigenvalues|EigenvectorCentrality|Eigenvectors|Element|ElementData|ElidedForms|Eliminate|EliminationOrder|Ellipsoid|EllipticE|EllipticExp|EllipticExpPrime|EllipticF|EllipticFilterModel|EllipticK|EllipticLog|EllipticNomeQ|EllipticPi|EllipticReducedHalfPeriods|EllipticTheta|EllipticThetaPrime|EmbedCode|EmbeddedHTML|EmbeddedService|EmbeddingObject|EmitSound|EmphasizeSyntaxErrors|EmpiricalDistribution|Empty|EmptyGraphQ|EmptyRegion|EnableConsolePrintPacket|Enabled|Encode|Encrypt|EncryptedObject|End|EndAdd|EndDialogPacket|EndFrontEndInteractionPacket|EndOfBuffer|EndOfFile|EndOfLine|EndOfString|EndPackage|EngineEnvironment|EngineeringForm|Enter|EnterExpressionPacket|EnterTextPacket|Entity|EntityClass|EntityClassList|EntityList|EntityProperties|EntityProperty|EntityPropertyClass|EntityTypeName|EntityValue|Entropy|EntropyFilter|Environment|Epilog|EpilogFunction|Equal|EqualColumns|EqualRows|EqualTilde|EquatedTo|Equilibrium|EquirippleFilterKernel|Equivalent|Erf|Erfc|Erfi|ErlangB|ErlangC|ErlangDistribution|Erosion|ErrorBox|ErrorBoxOptions|ErrorNorm|ErrorPacket|ErrorsDialogSettings|EscapeRadius|EstimatedBackground|EstimatedDistribution|EstimatedProcess|EstimatorGains|EstimatorRegulator|EuclideanDistance|EulerE|EulerGamma|EulerianGraphQ|EulerPhi|Evaluatable|Evaluate|Evaluated|EvaluatePacket|EvaluationBox|EvaluationCell|EvaluationCompletionAction|EvaluationData|EvaluationElements|EvaluationMode|EvaluationMonitor|EvaluationNotebook|EvaluationObject|EvaluationOrder|Evaluator|EvaluatorNames|EvenQ|EventData|EventEvaluator|EventHandler|EventHandlerTag|EventLabels|EventSeries|ExactBlackmanWindow|ExactNumberQ|ExactRootIsolation|ExampleData|Except|ExcludedForms|ExcludedLines|ExcludedPhysicalQuantities|ExcludePods|Exclusions|ExclusionsStyle|Exists|Exit|ExitDialog|ExoplanetData|Exp|Expand|ExpandAll|ExpandDenominator|ExpandFileName|ExpandNumerator|Expectation|ExpectationE|ExpectedValue|ExpGammaDistribution|ExpIntegralE|ExpIntegralEi|Exponent|ExponentFunction|ExponentialDistribution|ExponentialFamily|ExponentialGeneratingFunction|ExponentialMovingAverage|ExponentialPowerDistribution|ExponentPosition|ExponentStep|Export|ExportAutoReplacements|ExportForm|ExportPacket|ExportString|Expression|ExpressionCell|ExpressionPacket|ExpToTrig|ExtendedGCD|Extension|ExtentElementFunction|ExtentMarkers|ExtentSize|ExternalBundle|ExternalCall|ExternalDataCharacterEncoding|ExternalFunctionName|ExternalOptions|ExternalTypeSignature|Extract|ExtractArchive|ExtremeValueDistribution|FaceForm|FaceGrids|FaceGridsStyle|Factor|FactorComplete|Factorial|Factorial2|FactorialMoment|FactorialMomentGeneratingFunction|FactorialPower|FactorInteger|FactorList|FactorSquareFree|FactorSquareFreeList|FactorTerms|FactorTermsList|Fail|Failure|FailureAction|FailureDistribution|FareySequence|FARIMAProcess|FeatureNames|FeatureTypes|FEDisableConsolePrintPacket|FeedbackLinearize|FeedbackSector|FeedbackSectorStyle|FeedbackType|FEEnableConsolePrintPacket|FetalGrowthData|Fibonacci|Fibonorial|FieldHint|FieldHintStyle|FieldMasked|FieldSize|File|FileBaseName|FileByteCount|FileDate|FileExistsQ|FileExtension|FileFormat|FileHash|FileInformation|FileName|FileNameDepth|FileNameDialogSettings|FileNameDrop|FileNameJoin|FileNames|FileNameSetter|FileNameSplit|FileNameTake|FilePrint|FileTemplate|FileTemplateApply|FileType|FilledCurve|FilledCurveBox|FilledCurveBoxOptions|Filling|FillingStyle|FillingTransform|FilterRules|FinancialBond|FinancialData|FinancialDerivative|FinancialIndicator|Find|FindArgMax|FindArgMin|FindClique|FindClusters|FindCurvePath|FindCycle|FindDevices|FindDistribution|FindDistributionParameters|FindDivisions|FindEdgeCover|FindEdgeCut|FindEdgeIndependentPaths|FindEulerianCycle|FindFaces|FindFile|FindFit|FindFundamentalCycles|FindGeneratingFunction|FindGeoLocation|FindGeometricTransform|FindGraphCommunities|FindGraphIsomorphism|FindGraphPartition|FindHamiltonianCycle|FindHiddenMarkovStates|FindIndependentEdgeSet|FindIndependentVertexSet|FindInstance|FindIntegerNullVector|FindKClan|FindKClique|FindKClub|FindKPlex|FindLibrary|FindLinearRecurrence|FindList|FindMaximum|FindMaximumFlow|FindMaxValue|FindMinimum|FindMinimumCostFlow|FindMinimumCut|FindMinValue|FindPath|FindPeaks|FindPermutation|FindPostmanTour|FindProcessParameters|FindRoot|FindSequenceFunction|FindSettings|FindShortestPath|FindShortestTour|FindSpanningTree|FindThreshold|FindVertexCover|FindVertexCut|FindVertexIndependentPaths|Fine|FinishDynamic|FiniteAbelianGroupCount|FiniteGroupCount|FiniteGroupData|First|FirstCase|FirstPassageTimeDistribution|FirstPosition|FischerGroupFi22|FischerGroupFi23|FischerGroupFi24Prime|FisherHypergeometricDistribution|FisherRatioTest|FisherZDistribution|Fit|FitAll|FittedModel|FixedOrder|FixedPoint|FixedPointList|FlashSelection|Flat|Flatten|FlattenAt|FlatTopWindow|FlipView|Floor|FlowPolynomial|FlushPrintOutputPacket|Fold|FoldList|Font|FontColor|FontFamily|FontForm|FontName|FontOpacity|FontPostScriptName|FontProperties|FontReencoding|FontSize|FontSlant|FontSubstitutions|FontTracking|FontVariations|FontWeight|For|ForAll|Format|FormatName|FormatRules|FormatType|FormatTypeAutoConvert|FormatValues|FormBox|FormBoxOptions|FormFunction|FormLayoutFunction|FormObject|FormTheme|FormulaData|FormulaLookup|FortranForm|Forward|ForwardBackward|Fourier|FourierCoefficient|FourierCosCoefficient|FourierCosSeries|FourierCosTransform|FourierDCT|FourierDCTFilter|FourierDCTMatrix|FourierDST|FourierDSTMatrix|FourierMatrix|FourierParameters|FourierSequenceTransform|FourierSeries|FourierSinCoefficient|FourierSinSeries|FourierSinTransform|FourierTransform|FourierTrigSeries|FractionalBrownianMotionProcess|FractionalGaussianNoiseProcess|FractionalPart|FractionBox|FractionBoxOptions|FractionLine|Frame|FrameBox|FrameBoxOptions|Framed|FrameInset|FrameLabel|Frameless|FrameMargins|FrameStyle|FrameTicks|FrameTicksStyle|FRatioDistribution|FrechetDistribution|FreeQ|FrenetSerretSystem|FrequencySamplingFilterKernel|FresnelC|FresnelF|FresnelG|FresnelS|Friday|FrobeniusNumber|FrobeniusSolve|FromCharacterCode|FromCoefficientRules|FromContinuedFraction|FromDate|FromDigits|FromDMS|FromEntity|FromLetterNumber|FromPolarCoordinates|FromSphericalCoordinates|FromUnixTime|Front|FrontEndDynamicExpression|FrontEndEventActions|FrontEndExecute|FrontEndObject|FrontEndResource|FrontEndResourceString|FrontEndStackSize|FrontEndToken|FrontEndTokenExecute|FrontEndValueCache|FrontEndVersion|FrontFaceColor|FrontFaceOpacity|Full|FullAxes|FullDefinition|FullForm|FullGraphics|FullInformationOutputRegulator|FullOptions|FullRegion|FullSimplify|Function|FunctionDomain|FunctionExpand|FunctionInterpolation|FunctionPeriod|FunctionRange|FunctionSpace|FussellVeselyImportance|GaborFilter|GaborMatrix|GaborWavelet|GainMargins|GainPhaseMargins|GalaxyData|Gamma|GammaDistribution|GammaRegularized|GapPenalty|GARCHProcess|Gather|GatherBy|GaugeFaceElementFunction|GaugeFaceStyle|GaugeFrameElementFunction|GaugeFrameSize|GaugeFrameStyle|GaugeLabels|GaugeMarkers|GaugeStyle|GaussianFilter|GaussianIntegers|GaussianMatrix|GaussianWindow|GCD|GegenbauerC|General|GeneralizedLinearModelFit|GenerateAsymmetricKeyPair|GenerateConditions|GeneratedCell|GeneratedDocumentBinding|GenerateDocument|GeneratedParameters|GenerateSymmetricKey|GeneratingFunction|GeneratorDescription|GeneratorOutputType|Generic|GenericCylindricalDecomposition|GenomeData|GenomeLookup|GeoBackground|GeoBoundingBox|GeoBounds|GeoCenter|GeoCircle|GeodesicClosing|GeodesicDilation|GeodesicErosion|GeodesicOpening|GeoDestination|GeodesyData|GeoDirection|GeoDisk|GeoDisplacement|GeoDistance|GeoElevationData|GeoEntities|GeoGraphics|GeogravityModelData|GeoGridLines|GeoGridLinesStyle|GeoGridPosition|GeoGroup|GeoHemisphere|GeoHemisphereBoundary|GeoIdentify|GeoLabels|GeoListPlot|GeoLocation|GeologicalPeriodData|GeomagneticModelData|GeoMarker|GeometricBrownianMotionProcess|GeometricDistribution|GeometricMean|GeometricMeanFilter|GeometricTransformation|GeometricTransformation3DBox|GeometricTransformation3DBoxOptions|GeometricTransformationBox|GeometricTransformationBoxOptions|GeoModel|GeoNearest|GeoPath|GeoPosition|GeoPositionENU|GeoPositionXYZ|GeoProjection|GeoProjectionData|GeoRange|GeoRangePadding|GeoRegionValuePlot|GeoScaleBar|GeoServer|GeoStyling|GeoStylingImageFunction|GeoVariant|GeoVisibleRegion|GeoVisibleRegionBoundary|GeoWithinQ|GeoZoomLevel|GestureHandler|GestureHandlerTag|Get|GetBoundingBoxSizePacket|GetContext|GetEnvironment|GetFileName|GetFrontEndOptionsDataPacket|GetLinebreakInformationPacket|GetMenusPacket|GetPageBreakInformationPacket|Glaisher|GlobalClusteringCoefficient|GlobalPreferences|GlobalSession|Glow|GoldenRatio|GompertzMakehamDistribution|GoodmanKruskalGamma|GoodmanKruskalGammaTest|Goto|Grad|Gradient|GradientFilter|GradientOrientationFilter|GrammarApply|GrammarRules|GrammarToken|Graph|Graph3D|GraphAssortativity|GraphAutomorphismGroup|GraphCenter|GraphComplement|GraphData|GraphDensity|GraphDiameter|GraphDifference|GraphDisjointUnion|GraphDistance|GraphDistanceMatrix|GraphElementData|GraphEmbedding|GraphHighlight|GraphHighlightStyle|GraphHub|Graphics|Graphics3D|Graphics3DBox|Graphics3DBoxOptions|GraphicsArray|GraphicsBaseline|GraphicsBox|GraphicsBoxOptions|GraphicsColor|GraphicsColumn|GraphicsComplex|GraphicsComplex3DBox|GraphicsComplex3DBoxOptions|GraphicsComplexBox|GraphicsComplexBoxOptions|GraphicsContents|GraphicsData|GraphicsGrid|GraphicsGridBox|GraphicsGroup|GraphicsGroup3DBox|GraphicsGroup3DBoxOptions|GraphicsGroupBox|GraphicsGroupBoxOptions|GraphicsGrouping|GraphicsHighlightColor|GraphicsRow|GraphicsSpacing|GraphicsStyle|GraphIntersection|GraphLayout|GraphLinkEfficiency|GraphPeriphery|GraphPlot|GraphPlot3D|GraphPower|GraphPropertyDistribution|GraphQ|GraphRadius|GraphReciprocity|GraphRoot|GraphStyle|GraphUnion|Gray|GrayLevel|Greater|GreaterEqual|GreaterEqualLess|GreaterFullEqual|GreaterGreater|GreaterLess|GreaterSlantEqual|GreaterTilde|Green|Grid|GridBaseline|GridBox|GridBoxAlignment|GridBoxBackground|GridBoxDividers|GridBoxFrame|GridBoxItemSize|GridBoxItemStyle|GridBoxOptions|GridBoxSpacings|GridCreationSettings|GridDefaultElement|GridElementStyleOptions|GridFrame|GridFrameMargins|GridGraph|GridLines|GridLinesStyle|GroebnerBasis|GroupActionBase|GroupBy|GroupCentralizer|GroupElementFromWord|GroupElementPosition|GroupElementQ|GroupElements|GroupElementToWord|GroupGenerators|GroupMultiplicationTable|GroupOrbits|GroupOrder|GroupPageBreakWithin|GroupSetwiseStabilizer|GroupStabilizer|GroupStabilizerChain|GroupTogetherGrouping|GroupTogetherNestedGrouping|GrowCutComponents|Gudermannian|GumbelDistribution|HaarWavelet|HadamardMatrix|HalfLine|HalfNormalDistribution|HalfPlane|HamiltonianGraphQ|HammingDistance|HammingWindow|HankelH1|HankelH2|HankelMatrix|HannPoissonWindow|HannWindow|HaradaNortonGroupHN|HararyGraph|HarmonicMean|HarmonicMeanFilter|HarmonicNumber|Hash|Haversine|HazardFunction|Head|HeadCompose|HeaderLines|Heads|HeavisideLambda|HeavisidePi|HeavisideTheta|HeldGroupHe|HeldPart|HelpBrowserLookup|HelpBrowserNotebook|HelpBrowserSettings|Here|HermiteDecomposition|HermiteH|HermitianMatrixQ|HessenbergDecomposition|Hessian|HexadecimalCharacter|Hexahedron|HexahedronBox|HexahedronBoxOptions|HiddenMarkovProcess|HiddenSurface|HighlightGraph|HighlightImage|HighlightMesh|HighpassFilter|HigmanSimsGroupHS|HilbertFilter|HilbertMatrix|Histogram|Histogram3D|HistogramDistribution|HistogramList|HistogramTransform|HistogramTransformInterpolation|HistoricalPeriodData|HitMissTransform|HITSCentrality|HodgeDual|HoeffdingD|HoeffdingDTest|Hold|HoldAll|HoldAllComplete|HoldComplete|HoldFirst|HoldForm|HoldPattern|HoldRest|HolidayCalendar|HomeDirectory|HomePage|Horizontal|HorizontalForm|HorizontalGauge|HorizontalScrollPosition|HornerForm|HotellingTSquareDistribution|HoytDistribution|HTMLSave|HTTPHandler|HTTPRedirect|HTTPRequestData|HTTPResponse|Hue|HumanGrowthData|HumpDownHump|HumpEqual|HurwitzLerchPhi|HurwitzZeta|HyperbolicDistribution|HypercubeGraph|HyperexponentialDistribution|Hyperfactorial|Hypergeometric0F1|Hypergeometric0F1Regularized|Hypergeometric1F1|Hypergeometric1F1Regularized|Hypergeometric2F1|Hypergeometric2F1Regularized|HypergeometricDistribution|HypergeometricPFQ|HypergeometricPFQRegularized|HypergeometricU|Hyperlink|HyperlinkCreationSettings|Hyphenation|HyphenationOptions|HypoexponentialDistribution|HypothesisTestData|I|IconData|IconRules|Identity|IdentityMatrix|If|IgnoreCase|IgnoreDiacritics|IgnoringInactive|Im|Image|Image3D|Image3DSlices|ImageAccumulate|ImageAdd|ImageAdjust|ImageAlign|ImageApply|ImageApplyIndexed|ImageAspectRatio|ImageAssemble|ImageCache|ImageCacheValid|ImageCapture|ImageChannels|ImageClip|ImageCollage|ImageColorSpace|ImageCompose|ImageConvolve|ImageCooccurrence|ImageCorners|ImageCorrelate|ImageCorrespondingPoints|ImageCrop|ImageData|ImageDeconvolve|ImageDemosaic|ImageDifference|ImageDimensions|ImageDistance|ImageEffect|ImageFeatureTrack|ImageFileApply|ImageFileFilter|ImageFileScan|ImageFilter|ImageForestingComponents|ImageFormattingWidth|ImageForwardTransformation|ImageHistogram|ImageIdentify|ImageInstanceQ|ImageKeypoints|ImageLevels|ImageLines|ImageMargins|ImageMarkers|ImageMeasurements|ImageMultiply|ImageOffset|ImagePad|ImagePadding|ImagePartition|ImagePeriodogram|ImagePerspectiveTransformation|ImageQ|ImageRangeCache|ImageReflect|ImageRegion|ImageResize|ImageResolution|ImageRotate|ImageRotated|ImageSaliencyFilter|ImageScaled|ImageScan|ImageSize|ImageSizeAction|ImageSizeCache|ImageSizeMultipliers|ImageSizeRaw|ImageSubtract|ImageTake|ImageTransformation|ImageTrim|ImageType|ImageValue|ImageValuePositions|ImagingDevice|ImplicitRegion|Implies|Import|ImportAutoReplacements|ImportString|ImprovementImportance|In|Inactivate|Inactive|IncidenceGraph|IncidenceList|IncidenceMatrix|IncludeConstantBasis|IncludeFileExtension|IncludeGeneratorTasks|IncludePods|IncludeQuantities|IncludeSingularTerm|IncludeWindowTimes|Increment|IndefiniteMatrixQ|Indent|IndentingNewlineSpacings|IndentMaxFraction|IndependenceTest|IndependentEdgeSetQ|IndependentUnit|IndependentVertexSetQ|Indeterminate|IndeterminateThreshold|IndeterminateValue|IndexCreationOptions|Indexed|IndexGraph|IndexTag|Inequality|InexactNumberQ|InexactNumbers|InfiniteLine|InfinitePlane|Infix|InflationAdjust|InflationMethod|Information|Inherited|InheritScope|InhomogeneousPoissonProcess|Initialization|InitializationCell|InitializationCellEvaluation|InitializationCellWarning|InlineCounterAssignments|InlineCounterIncrements|InlinePart|InlineRules|Inner|Inpaint|Input|InputAliases|InputAssumptions|InputAutoReplacements|InputField|InputFieldBox|InputFieldBoxOptions|InputForm|InputGrouping|InputNamePacket|InputNotebook|InputPacket|InputSettings|InputStream|InputString|InputStringPacket|InputToBoxFormPacket|Insert|InsertionFunction|InsertionPointObject|InsertLinebreaks|InsertResults|Inset|Inset3DBox|Inset3DBoxOptions|InsetBox|InsetBoxOptions|Install|InstallService|InString|Integer|IntegerDigits|IntegerExponent|IntegerLength|IntegerName|IntegerPart|IntegerPartitions|IntegerQ|Integers|IntegerString|Integral|Integrate|Interactive|InteractiveTradingChart|Interlaced|Interleaving|InternallyBalancedDecomposition|InterpolatingFunction|InterpolatingPolynomial|Interpolation|InterpolationOrder|InterpolationPoints|InterpolationPrecision|Interpretation|InterpretationBox|InterpretationBoxOptions|InterpretationFunction|Interpreter|InterpretTemplate|InterquartileRange|Interrupt|InterruptSettings|IntersectingQ|Intersection|Interval|IntervalIntersection|IntervalMemberQ|IntervalSlider|IntervalUnion|Into|Inverse|InverseBetaRegularized|InverseCDF|InverseChiSquareDistribution|InverseContinuousWaveletTransform|InverseDistanceTransform|InverseEllipticNomeQ|InverseErf|InverseErfc|InverseFourier|InverseFourierCosTransform|InverseFourierSequenceTransform|InverseFourierSinTransform|InverseFourierTransform|InverseFunction|InverseFunctions|InverseGammaDistribution|InverseGammaRegularized|InverseGaussianDistribution|InverseGudermannian|InverseHaversine|InverseJacobiCD|InverseJacobiCN|InverseJacobiCS|InverseJacobiDC|InverseJacobiDN|InverseJacobiDS|InverseJacobiNC|InverseJacobiND|InverseJacobiNS|InverseJacobiSC|InverseJacobiSD|InverseJacobiSN|InverseLaplaceTransform|InversePermutation|InverseRadon|InverseSeries|InverseSurvivalFunction|InverseTransformedRegion|InverseWaveletTransform|InverseWeierstrassP|InverseZTransform|Invisible|InvisibleApplication|InvisibleTimes|IrreduciblePolynomialQ|IslandData|IsolatingInterval|IsomorphicGraphQ|IsotopeData|Italic|Item|ItemBox|ItemBoxOptions|ItemSize|ItemStyle|ItoProcess|JaccardDissimilarity|JacobiAmplitude|Jacobian|JacobiCD|JacobiCN|JacobiCS|JacobiDC|JacobiDN|JacobiDS|JacobiNC|JacobiND|JacobiNS|JacobiP|JacobiSC|JacobiSD|JacobiSN|JacobiSymbol|JacobiZeta|JankoGroupJ1|JankoGroupJ2|JankoGroupJ3|JankoGroupJ4|JarqueBeraALMTest|JohnsonDistribution|Join|JoinAcross|Joined|JoinedCurve|JoinedCurveBox|JoinedCurveBoxOptions|JoinForm|JordanDecomposition|JordanModelDecomposition|JuliaSetBoettcher|JuliaSetIterationCount|JuliaSetPlot|JuliaSetPoints|K|KagiChart|KaiserBesselWindow|KaiserWindow|KalmanEstimator|KalmanFilter|KarhunenLoeveDecomposition|KaryTree|KatzCentrality|KCoreComponents|KDistribution|KEdgeConnectedComponents|KEdgeConnectedGraphQ|KelvinBei|KelvinBer|KelvinKei|KelvinKer|KendallTau|KendallTauTest|KernelExecute|KernelMixtureDistribution|Kernels|Ket|Key|KeyComplement|KeyDrop|KeyDropFrom|KeyExistsQ|KeyFreeQ|KeyIntersection|KeyMap|KeyMemberQ|KeypointStrength|KeyRenaming|Keys|KeySelect|KeySort|KeySortBy|KeyTake|KeyUnion|KeyValueMap|Khinchin|KillProcess|KirchhoffGraph|KirchhoffMatrix|KleinInvariantJ|KnightTourGraph|KnotData|KnownUnitQ|KolmogorovSmirnovTest|KroneckerDelta|KroneckerModelDecomposition|KroneckerProduct|KroneckerSymbol|KuiperTest|KumaraswamyDistribution|Kurtosis|KuwaharaFilter|KVertexConnectedComponents|KVertexConnectedGraphQ|LABColor|Label|Labeled|LabeledSlider|LabelingFunction|LabelStyle|LaguerreL|LakeData|LambdaComponents|LambertW|LaminaData|LanczosWindow|LandauDistribution|Language|LanguageCategory|LanguageData|LanguageIdentify|LaplaceDistribution|LaplaceTransform|Laplacian|LaplacianFilter|LaplacianGaussianFilter|Large|Larger|Last|Latitude|LatitudeLongitude|LatticeData|LatticeReduce|Launch|LaunchKernels|LayeredGraphPlot|LayerSizeFunction|LayoutInformation|LCHColor|LCM|LeafCount|LeapYearQ|LeastSquares|LeastSquaresFilterKernel|Left|LeftArrow|LeftArrowBar|LeftArrowRightArrow|LeftDownTeeVector|LeftDownVector|LeftDownVectorBar|LeftRightArrow|LeftRightVector|LeftTee|LeftTeeArrow|LeftTeeVector|LeftTriangle|LeftTriangleBar|LeftTriangleEqual|LeftUpDownVector|LeftUpTeeVector|LeftUpVector|LeftUpVectorBar|LeftVector|LeftVectorBar|LegendAppearance|Legended|LegendFunction|LegendLabel|LegendLayout|LegendMargins|LegendMarkers|LegendMarkerSize|LegendreP|LegendreQ|LegendreType|Length|LengthWhile|LerchPhi|Less|LessEqual|LessEqualGreater|LessFullEqual|LessGreater|LessLess|LessSlantEqual|LessTilde|LetterCharacter|LetterCounts|LetterNumber|LetterOrder|LetterQ|Level|LeveneTest|LeviCivitaTensor|LevyDistribution|Lexicographic|LibraryDataType|LibraryFunction|LibraryFunctionError|LibraryFunctionInformation|LibraryFunctionLoad|LibraryFunctionUnload|LibraryLoad|LibraryUnload|LicenseID|LiftingFilterData|LiftingWaveletTransform|LightBlue|LightBrown|LightCyan|Lighter|LightGray|LightGreen|Lighting|LightingAngle|LightMagenta|LightOrange|LightPink|LightPurple|LightRed|LightSources|LightYellow|Likelihood|Limit|LimitsPositioning|LimitsPositioningTokens|LindleyDistribution|Line|Line3DBox|Line3DBoxOptions|LinearFilter|LinearFractionalTransform|LinearGradientImage|LinearizingTransformationData|LinearModelFit|LinearOffsetFunction|LinearProgramming|LinearRecurrence|LinearSolve|LinearSolveFunction|LineBox|LineBoxOptions|LineBreak|LinebreakAdjustments|LineBreakChart|LinebreakSemicolonWeighting|LineBreakWithin|LineColor|LineGraph|LineIndent|LineIndentMaxFraction|LineIntegralConvolutionPlot|LineIntegralConvolutionScale|LineLegend|LineOpacity|LineSpacing|LineWrapParts|LinkActivate|LinkClose|LinkConnect|LinkConnectedQ|LinkCreate|LinkError|LinkFlush|LinkFunction|LinkHost|LinkInterrupt|LinkLaunch|LinkMode|LinkObject|LinkOpen|LinkOptions|LinkPatterns|LinkProtocol|LinkRankCentrality|LinkRead|LinkReadHeld|LinkReadyQ|Links|LinkService|LinkWrite|LinkWriteHeld|LiouvilleLambda|List|Listable|ListAnimate|ListContourPlot|ListContourPlot3D|ListConvolve|ListCorrelate|ListCurvePathPlot|ListDeconvolve|ListDensityPlot|Listen|ListFormat|ListFourierSequenceTransform|ListInterpolation|ListLineIntegralConvolutionPlot|ListLinePlot|ListLogLinearPlot|ListLogLogPlot|ListLogPlot|ListPicker|ListPickerBox|ListPickerBoxBackground|ListPickerBoxOptions|ListPlay|ListPlot|ListPlot3D|ListPointPlot3D|ListPolarPlot|ListQ|ListStreamDensityPlot|ListStreamPlot|ListSurfacePlot3D|ListVectorDensityPlot|ListVectorPlot|ListVectorPlot3D|ListZTransform|Literal|LiteralSearch|LocalAdaptiveBinarize|LocalClusteringCoefficient|LocalizeDefinitions|LocalizeVariables|LocalTime|LocalTimeZone|LocationEquivalenceTest|LocationTest|Locator|LocatorAutoCreate|LocatorBox|LocatorBoxOptions|LocatorCentering|LocatorPane|LocatorPaneBox|LocatorPaneBoxOptions|LocatorRegion|Locked|Log|Log10|Log2|LogBarnesG|LogGamma|LogGammaDistribution|LogicalExpand|LogIntegral|LogisticDistribution|LogisticSigmoid|LogitModelFit|LogLikelihood|LogLinearPlot|LogLogisticDistribution|LogLogPlot|LogMultinormalDistribution|LogNormalDistribution|LogPlot|LogRankTest|LogSeriesDistribution|LongEqual|Longest|LongestAscendingSequence|LongestCommonSequence|LongestCommonSequencePositions|LongestCommonSubsequence|LongestCommonSubsequencePositions|LongestMatch|LongForm|Longitude|LongLeftArrow|LongLeftRightArrow|LongRightArrow|Lookup|Loopback|LoopFreeGraphQ|LowerCaseQ|LowerLeftArrow|LowerRightArrow|LowerTriangularize|LowpassFilter|LQEstimatorGains|LQGRegulator|LQOutputRegulatorGains|LQRegulatorGains|LUBackSubstitution|LucasL|LuccioSamiComponents|LUDecomposition|LunarEclipse|LUVColor|LyapunovSolve|LyonsGroupLy|MachineID|MachineName|MachineNumberQ|MachinePrecision|MacintoshSystemPageSetup|Magenta|Magnification|Magnify|MainSolve|MaintainDynamicCaches|Majority|MakeBoxes|MakeExpression|MakeRules|ManagedLibraryExpressionID|ManagedLibraryExpressionQ|MandelbrotSetBoettcher|MandelbrotSetDistance|MandelbrotSetIterationCount|MandelbrotSetMemberQ|MandelbrotSetPlot|MangoldtLambda|ManhattanDistance|Manipulate|Manipulator|MannedSpaceMissionData|MannWhitneyTest|MantissaExponent|Manual|Map|MapAll|MapAt|MapIndexed|MAProcess|MapThread|MarcumQ|MardiaCombinedTest|MardiaKurtosisTest|MardiaSkewnessTest|MarginalDistribution|MarkovProcessProperties|Masking|MatchingDissimilarity|MatchLocalNameQ|MatchLocalNames|MatchQ|Material|MathematicaNotation|MathieuC|MathieuCharacteristicA|MathieuCharacteristicB|MathieuCharacteristicExponent|MathieuCPrime|MathieuGroupM11|MathieuGroupM12|MathieuGroupM22|MathieuGroupM23|MathieuGroupM24|MathieuS|MathieuSPrime|MathMLForm|MathMLText|Matrices|MatrixExp|MatrixForm|MatrixFunction|MatrixLog|MatrixPlot|MatrixPower|MatrixQ|MatrixRank|Max|MaxBend|MaxCellMeasure|MaxDetect|MaxExtraBandwidths|MaxExtraConditions|MaxFeatureDisplacement|MaxFeatures|MaxFilter|MaximalBy|Maximize|MaxItems|MaxIterations|MaxMemoryUsed|MaxMixtureKernels|MaxPlotPoints|MaxPoints|MaxRecursion|MaxStableDistribution|MaxStepFraction|MaxSteps|MaxStepSize|MaxValue|MaxwellDistribution|McLaughlinGroupMcL|Mean|MeanClusteringCoefficient|MeanDegreeConnectivity|MeanDeviation|MeanFilter|MeanGraphDistance|MeanNeighborDegree|MeanShift|MeanShiftFilter|Median|MedianDeviation|MedianFilter|MedicalTestData|Medium|MeijerG|MeixnerDistribution|MemberQ|MemoryConstrained|MemoryConstraint|MemoryInUse|Menu|MenuAppearance|MenuCommandKey|MenuEvaluator|MenuItem|MenuPacket|MenuSortingValue|MenuStyle|MenuView|Merge|MergeDifferences|Mesh|MeshCellCentroid|MeshCellCount|MeshCellIndex|MeshCellLabel|MeshCellMarker|MeshCellMeasure|MeshCellQuality|MeshCells|MeshCellStyle|MeshCoordinates|MeshFunctions|MeshPrimitives|MeshQualityGoal|MeshRange|MeshRefinementFunction|MeshRegion|MeshRegionQ|MeshShading|MeshStyle|Message|MessageDialog|MessageList|MessageName|MessageOptions|MessagePacket|Messages|MessagesNotebook|MetaCharacters|MetaInformation|MeteorShowerData|Method|MethodOptions|MexicanHatWavelet|MeyerWavelet|Min|MinColorDistance|MinDetect|MineralData|MinFilter|MinimalBy|MinimalPolynomial|MinimalStateSpaceModel|Minimize|MinimumTimeIncrement|MinIntervalSize|MinkowskiQuestionMark|MinMax|MinorPlanetData|Minors|MinRecursion|MinSize|MinStableDistribution|Minus|MinusPlus|MinValue|Missing|MissingBehavior|MissingDataMethod|MissingDataRules|MissingString|MissingStyle|MittagLefflerE|MixedGraphQ|MixedRadix|MixedRadixQuantity|MixtureDistribution|Mod|Modal|Mode|Modular|ModularLambda|Module|Modulus|MoebiusMu|Moment|Momentary|MomentConvert|MomentEvaluate|MomentGeneratingFunction|Monday|Monitor|MonomialList|MonomialOrder|MonsterGroupM|MoonPhase|MoonPosition|MorletWavelet|MorphologicalBinarize|MorphologicalBranchPoints|MorphologicalComponents|MorphologicalEulerNumber|MorphologicalGraph|MorphologicalPerimeter|MorphologicalTransform|Most|MountainData|MouseAnnotation|MouseAppearance|MouseAppearanceTag|MouseButtons|Mouseover|MousePointerNote|MousePosition|MovieData|MovingAverage|MovingMap|MovingMedian|MoyalDistribution|Multicolumn|MultiedgeStyle|MultigraphQ|MultilaunchWarning|MultiLetterItalics|MultiLetterStyle|MultilineFunction|Multinomial|MultinomialDistribution|MultinormalDistribution|MultiplicativeOrder|Multiplicity|Multiselection|MultivariateHypergeometricDistribution|MultivariatePoissonDistribution|MultivariateTDistribution|N|NakagamiDistribution|NameQ|Names|NamespaceBox|Nand|NArgMax|NArgMin|NBernoulliB|NCache|NDSolve|NDSolveValue|Nearest|NearestFunction|NebulaData|NeedCurrentFrontEndPackagePacket|NeedCurrentFrontEndSymbolsPacket|NeedlemanWunschSimilarity|Needs|Negative|NegativeBinomialDistribution|NegativeDefiniteMatrixQ|NegativeMultinomialDistribution|NegativeSemidefiniteMatrixQ|NeighborhoodData|NeighborhoodGraph|Nest|NestedGreaterGreater|NestedLessLess|NestedScriptRules|NestList|NestWhile|NestWhileList|NeumannValue|NevilleThetaC|NevilleThetaD|NevilleThetaN|NevilleThetaS|NewPrimitiveStyle|NExpectation|Next|NextCell|NextPrime|NHoldAll|NHoldFirst|NHoldRest|NicholsGridLines|NicholsPlot|NightHemisphere|NIntegrate|NMaximize|NMaxValue|NMinimize|NMinValue|NominalVariables|NonAssociative|NoncentralBetaDistribution|NoncentralChiSquareDistribution|NoncentralFRatioDistribution|NoncentralStudentTDistribution|NonCommutativeMultiply|NonConstants|NoneTrue|NonlinearModelFit|NonlinearStateSpaceModel|NonlocalMeansFilter|NonNegative|NonPositive|Nor|NorlundB|Norm|Normal|NormalDistribution|NormalGrouping|Normalize|Normalized|NormalizedSquaredEuclideanDistance|NormalMatrixQ|NormalsFunction|NormFunction|Not|NotCongruent|NotCupCap|NotDoubleVerticalBar|Notebook|NotebookApply|NotebookAutoSave|NotebookClose|NotebookConvertSettings|NotebookCreate|NotebookCreateReturnObject|NotebookDefault|NotebookDelete|NotebookDirectory|NotebookDynamicExpression|NotebookEvaluate|NotebookEventActions|NotebookFileName|NotebookFind|NotebookFindReturnObject|NotebookGet|NotebookGetLayoutInformationPacket|NotebookGetMisspellingsPacket|NotebookImport|NotebookInformation|NotebookInterfaceObject|NotebookLocate|NotebookObject|NotebookOpen|NotebookOpenReturnObject|NotebookPath|NotebookPrint|NotebookPut|NotebookPutReturnObject|NotebookRead|NotebookResetGeneratedCells|Notebooks|NotebookSave|NotebookSaveAs|NotebookSelection|NotebookSetupLayoutInformationPacket|NotebooksMenu|NotebookTemplate|NotebookWrite|NotElement|NotEqualTilde|NotExists|NotGreater|NotGreaterEqual|NotGreaterFullEqual|NotGreaterGreater|NotGreaterLess|NotGreaterSlantEqual|NotGreaterTilde|NotHumpDownHump|NotHumpEqual|NotificationFunction|NotLeftTriangle|NotLeftTriangleBar|NotLeftTriangleEqual|NotLess|NotLessEqual|NotLessFullEqual|NotLessGreater|NotLessLess|NotLessSlantEqual|NotLessTilde|NotNestedGreaterGreater|NotNestedLessLess|NotPrecedes|NotPrecedesEqual|NotPrecedesSlantEqual|NotPrecedesTilde|NotReverseElement|NotRightTriangle|NotRightTriangleBar|NotRightTriangleEqual|NotSquareSubset|NotSquareSubsetEqual|NotSquareSuperset|NotSquareSupersetEqual|NotSubset|NotSubsetEqual|NotSucceeds|NotSucceedsEqual|NotSucceedsSlantEqual|NotSucceedsTilde|NotSuperset|NotSupersetEqual|NotTilde|NotTildeEqual|NotTildeFullEqual|NotTildeTilde|NotVerticalBar|Now|NProbability|NProduct|NProductFactors|NRoots|NSolve|NSum|NSumTerms|NuclearExplosionData|NuclearReactorData|Null|NullRecords|NullSpace|NullWords|Number|NumberFieldClassNumber|NumberFieldDiscriminant|NumberFieldFundamentalUnits|NumberFieldIntegralBasis|NumberFieldNormRepresentatives|NumberFieldRegulator|NumberFieldRootsOfUnity|NumberFieldSignature|NumberForm|NumberFormat|NumberLinePlot|NumberMarks|NumberMultiplier|NumberPadding|NumberPoint|NumberQ|NumberSeparator|NumberSigns|NumberString|Numerator|NumericFunction|NumericQ|NuttallWindow|NValues|NyquistGridLines|NyquistPlot|O|ObservabilityGramian|ObservabilityMatrix|ObservableDecomposition|ObservableModelQ|OceanData|OddQ|Off|Offset|OLEData|On|ONanGroupON|OneIdentity|Opacity|Open|OpenAppend|Opener|OpenerBox|OpenerBoxOptions|OpenerView|OpenFunctionInspectorPacket|Opening|OpenRead|OpenSpecialOptions|OpenTemporary|OpenWrite|Operate|OperatingSystem|OptimumFlowData|Optional|OptionalElement|OptionInspectorSettings|OptionQ|Options|OptionsPacket|OptionsPattern|OptionValue|OptionValueBox|OptionValueBoxOptions|Or|Orange|Order|OrderDistribution|OrderedQ|Ordering|Orderless|OrderlessPatternSequence|OrnsteinUhlenbeckProcess|Orthogonalize|OrthogonalMatrixQ|Out|Outer|OutputAutoOverwrite|OutputControllabilityMatrix|OutputControllableModelQ|OutputForm|OutputFormData|OutputGrouping|OutputMathEditExpression|OutputNamePacket|OutputResponse|OutputSizeLimit|OutputStream|Over|OverBar|OverDot|Overflow|OverHat|Overlaps|Overlay|OverlayBox|OverlayBoxOptions|Overscript|OverscriptBox|OverscriptBoxOptions|OverTilde|OverVector|OverwriteTarget|OwenT|OwnValues|Package|PackingMethod|PaddedForm|Padding|PadeApproximant|PadLeft|PadRight|PageBreakAbove|PageBreakBelow|PageBreakWithin|PageFooterLines|PageFooters|PageHeaderLines|PageHeaders|PageHeight|PageRankCentrality|PageWidth|PairedBarChart|PairedHistogram|PairedSmoothHistogram|PairedTTest|PairedZTest|PaletteNotebook|PalettePath|Pane|PaneBox|PaneBoxOptions|Panel|PanelBox|PanelBoxOptions|Paneled|PaneSelector|PaneSelectorBox|PaneSelectorBoxOptions|PaperWidth|ParabolicCylinderD|ParagraphIndent|ParagraphSpacing|ParallelArray|ParallelCombine|ParallelDo|Parallelepiped|ParallelEvaluate|Parallelization|Parallelize|ParallelMap|ParallelNeeds|Parallelogram|ParallelProduct|ParallelSubmit|ParallelSum|ParallelTable|ParallelTry|Parameter|ParameterEstimator|ParameterMixtureDistribution|ParameterVariables|ParametricFunction|ParametricNDSolve|ParametricNDSolveValue|ParametricPlot|ParametricPlot3D|ParametricRegion|ParentBox|ParentCell|ParentConnect|ParentDirectory|ParentForm|Parenthesize|ParentList|ParentNotebook|ParetoDistribution|ParkData|Part|PartBehavior|PartialCorrelationFunction|PartialD|ParticleAcceleratorData|ParticleData|Partition|PartitionsP|PartitionsQ|ParzenWindow|PascalDistribution|PassEventsDown|PassEventsUp|Paste|PasteBoxFormInlineCells|PasteButton|Path|PathGraph|PathGraphQ|Pattern|PatternSequence|PatternTest|PauliMatrix|PaulWavelet|Pause|PausedTime|PDF|PeakDetect|PearsonChiSquareTest|PearsonCorrelationTest|PearsonDistribution|PerformanceGoal|PeriodicInterpolation|Periodogram|PeriodogramArray|Permissions|PermissionsGroup|PermissionsGroups|PermutationCycles|PermutationCyclesQ|PermutationGroup|PermutationLength|PermutationList|PermutationListQ|PermutationMax|PermutationMin|PermutationOrder|PermutationPower|PermutationProduct|PermutationReplace|Permutations|PermutationSupport|Permute|PeronaMalikFilter|Perpendicular|PersonData|PERTDistribution|PetersenGraph|PhaseMargins|PhaseRange|PhysicalSystemData|Pi|Pick|PIDData|PIDDerivativeFilter|PIDFeedforward|PIDTune|Piecewise|PiecewiseExpand|PieChart|PieChart3D|PillaiTrace|PillaiTraceTest|Pink|Pivoting|PixelConstrained|PixelValue|PixelValuePositions|Placed|Placeholder|PlaceholderReplace|Plain|PlanarGraphQ|PlanckRadiationLaw|PlaneCurveData|PlanetaryMoonData|PlanetData|PlantData|Play|PlayRange|Plot|Plot3D|Plot3Matrix|PlotDivision|PlotJoined|PlotLabel|PlotLayout|PlotLegends|PlotMarkers|PlotPoints|PlotRange|PlotRangeClipping|PlotRangeClipPlanesStyle|PlotRangePadding|PlotRegion|PlotStyle|PlotTheme|Pluralize|Plus|PlusMinus|Pochhammer|PodStates|PodWidth|Point|Point3DBox|Point3DBoxOptions|PointBox|PointBoxOptions|PointFigureChart|PointLegend|PointSize|PoissonConsulDistribution|PoissonDistribution|PoissonProcess|PoissonWindow|PolarAxes|PolarAxesOrigin|PolarGridLines|PolarPlot|PolarTicks|PoleZeroMarkers|PolyaAeppliDistribution|PolyGamma|Polygon|Polygon3DBox|Polygon3DBoxOptions|PolygonBox|PolygonBoxOptions|PolygonHoleScale|PolygonIntersections|PolygonScale|PolyhedronData|PolyLog|PolynomialExtendedGCD|PolynomialForm|PolynomialGCD|PolynomialLCM|PolynomialMod|PolynomialQ|PolynomialQuotient|PolynomialQuotientRemainder|PolynomialReduce|PolynomialRemainder|Polynomials|PopupMenu|PopupMenuBox|PopupMenuBoxOptions|PopupView|PopupWindow|Position|PositionIndex|Positive|PositiveDefiniteMatrixQ|PositiveSemidefiniteMatrixQ|PossibleZeroQ|Postfix|PostScript|Power|PowerDistribution|PowerExpand|PowerMod|PowerModList|PowerRange|PowerSpectralDensity|PowersRepresentations|PowerSymmetricPolynomial|Precedence|PrecedenceForm|Precedes|PrecedesEqual|PrecedesSlantEqual|PrecedesTilde|Precision|PrecisionGoal|PreDecrement|Predict|PredictorFunction|PredictorInformation|PredictorMeasurements|PredictorMeasurementsObject|PreemptProtect|PreferencesPath|Prefix|PreIncrement|Prepend|PrependTo|PreserveImageOptions|Previous|PreviousCell|PriceGraphDistribution|PrimaryPlaceholder|Prime|PrimeNu|PrimeOmega|PrimePi|PrimePowerQ|PrimeQ|Primes|PrimeZetaP|PrimitiveRoot|PrimitiveRootList|PrincipalComponents|PrincipalValue|Print|PrintableASCIIQ|PrintAction|PrintForm|PrintingCopies|PrintingOptions|PrintingPageRange|PrintingStartingPageNumber|PrintingStyleEnvironment|PrintPrecision|PrintTemporary|Prism|PrismBox|PrismBoxOptions|PrivateCellOptions|PrivateEvaluationOptions|PrivateFontOptions|PrivateFrontEndOptions|PrivateKey|PrivateNotebookOptions|PrivatePaths|Probability|ProbabilityDistribution|ProbabilityPlot|ProbabilityPr|ProbabilityScalePlot|ProbitModelFit|ProcessConnection|ProcessDirectory|ProcessEnvironment|Processes|ProcessEstimator|ProcessInformation|ProcessObject|ProcessParameterAssumptions|ProcessParameterQ|ProcessStateDomain|ProcessStatus|ProcessTimeDomain|Product|ProductDistribution|ProductLog|ProgressIndicator|ProgressIndicatorBox|ProgressIndicatorBoxOptions|Projection|Prolog|PromptForm|Properties|Property|PropertyList|PropertyValue|Proportion|Proportional|Protect|Protected|ProteinData|Pruning|PseudoInverse|PublicKey|PulsarData|Purple|Put|PutAppend|Pyramid|PyramidBox|PyramidBoxOptions|QBinomial|QFactorial|QGamma|QHypergeometricPFQ|QPochhammer|QPolyGamma|QRDecomposition|QuadraticIrrationalQ|Qualifiers|Quantile|QuantilePlot|Quantity|QuantityArray|QuantityForm|QuantityMagnitude|QuantityQ|QuantityThread|QuantityUnit|QuantityVariable|QuantityVariableCanonicalUnit|QuantityVariableDimensions|QuantityVariableIdentifier|QuantityVariablePhysicalQuantity|Quartics|QuartileDeviation|Quartiles|QuartileSkewness|Query|QueueingNetworkProcess|QueueingProcess|QueueProperties|Quiet|Quit|Quotient|QuotientRemainder|RadialGradientImage|RadialityCentrality|RadicalBox|RadicalBoxOptions|RadioButton|RadioButtonBar|RadioButtonBox|RadioButtonBoxOptions|Radon|RamanujanTau|RamanujanTauL|RamanujanTauTheta|RamanujanTauZ|Random|RandomChoice|RandomColor|RandomComplex|RandomFunction|RandomGraph|RandomImage|RandomInteger|RandomPermutation|RandomPrime|RandomReal|RandomSample|RandomSeed|RandomVariate|RandomWalkProcess|Range|RangeFilter|RangeSpecification|RankedMax|RankedMin|Raster|Raster3D|Raster3DBox|Raster3DBoxOptions|RasterArray|RasterBox|RasterBoxOptions|Rasterize|RasterSize|Rational|RationalFunctions|Rationalize|Rationals|Ratios|Raw|RawArray|RawBoxes|RawData|RawMedium|RayleighDistribution|Re|Read|ReadLine|ReadList|ReadProtected|ReadString|Real|RealBlockDiagonalForm|RealDigits|RealExponent|Reals|Reap|RecognitionPrior|RecognitionThreshold|Record|RecordLists|RecordSeparators|Rectangle|RectangleBox|RectangleBoxOptions|RectangleChart|RectangleChart3D|RecurrenceFilter|RecurrenceTable|RecurringDigitsForm|Red|Reduce|RefBox|ReferenceLineStyle|ReferenceMarkers|ReferenceMarkerStyle|Refine|ReflectionMatrix|ReflectionTransform|Refresh|RefreshRate|RegionBinarize|RegionBoundary|RegionBounds|RegionCentroid|RegionDifference|RegionDimension|RegionDistance|RegionDistanceFunction|RegionEmbeddingDimension|RegionFunction|RegionIntersection|RegionMeasure|RegionMember|RegionMemberFunction|RegionNearest|RegionNearestFunction|RegionPlot|RegionPlot3D|RegionProduct|RegionQ|RegionSymmetricDifference|RegionUnion|RegularExpression|Regularization|RegularlySampledQ|ReIm|Reinstall|Release|ReleaseHold|ReliabilityDistribution|ReliefImage|ReliefPlot|Remove|RemoveAlphaChannel|RemoveAsynchronousTask|RemoveBackground|Removed|RemoveDiacritics|RemoveInputStreamMethod|RemoveOutputStreamMethod|RemoveProperty|RemoveScheduledTask|RemoveUsers|RenameDirectory|RenameFile|RenderAll|RenderingOptions|RenewalProcess|RenkoChart|Repeated|RepeatedNull|RepeatedString|RepeatedTiming|RepeatingElement|Replace|ReplaceAll|ReplaceHeldPart|ReplaceImageValue|ReplaceList|ReplacePart|ReplacePixelValue|ReplaceRepeated|RequiredPhysicalQuantities|Resampling|ResamplingAlgorithmData|ResamplingMethod|Rescale|RescalingTransform|ResetDirectory|ResetMenusPacket|ResetScheduledTask|Residue|Resolve|ResponseForm|Rest|Restricted|Resultant|ResumePacket|Return|ReturnExpressionPacket|ReturnInputFormPacket|ReturnPacket|ReturnTextPacket|Reverse|ReverseBiorthogonalSplineWavelet|ReverseElement|ReverseEquilibrium|ReverseGraph|ReverseUpEquilibrium|RevolutionAxis|RevolutionPlot3D|RGBColor|RiccatiSolve|RiceDistribution|RidgeFilter|RiemannR|RiemannSiegelTheta|RiemannSiegelZ|RiemannXi|Riffle|Right|RightArrow|RightArrowBar|RightArrowLeftArrow|RightComposition|RightCosetRepresentative|RightDownTeeVector|RightDownVector|RightDownVectorBar|RightTee|RightTeeArrow|RightTeeVector|RightTriangle|RightTriangleBar|RightTriangleEqual|RightUpDownVector|RightUpTeeVector|RightUpVector|RightUpVectorBar|RightVector|RightVectorBar|RiskAchievementImportance|RiskReductionImportance|RogersTanimotoDissimilarity|Root|RootApproximant|RootIntervals|RootLocusPlot|RootMeanSquare|RootOfUnityQ|RootReduce|Roots|RootSum|Rotate|RotateLabel|RotateLeft|RotateRight|RotationAction|RotationBox|RotationBoxOptions|RotationMatrix|RotationTransform|Round|RoundImplies|RoundingRadius|Row|RowAlignments|RowBackgrounds|RowBox|RowHeights|RowLines|RowMinHeight|RowReduce|RowsEqual|RowSpacings|RSolve|RSolveValue|RudvalisGroupRu|Rule|RuleCondition|RuleDelayed|RuleForm|RulerUnits|Run|RunProcess|RunScheduledTask|RunThrough|RuntimeAttributes|RuntimeOptions|RussellRaoDissimilarity|SameQ|SameTest|SampleDepth|SampledSoundFunction|SampledSoundList|SampleRate|SamplingPeriod|SARIMAProcess|SARMAProcess|SASTriangle|SatelliteData|SatisfiabilityCount|SatisfiabilityInstances|SatisfiableQ|Saturday|Save|Saveable|SaveAutoDelete|SaveDefinitions|SavitzkyGolayMatrix|SawtoothWave|Scale|Scaled|ScaleDivisions|ScaledMousePosition|ScaleOrigin|ScalePadding|ScaleRanges|ScaleRangeStyle|ScalingFunctions|ScalingMatrix|ScalingTransform|Scan|ScheduledTask|ScheduledTaskInformation|ScheduledTaskInformationData|ScheduledTaskObject|ScheduledTasks|SchurDecomposition|ScientificForm|ScorerGi|ScorerGiPrime|ScorerHi|ScorerHiPrime|ScreenRectangle|ScreenStyleEnvironment|ScriptBaselineShifts|ScriptForm|ScriptLevel|ScriptMinSize|ScriptRules|ScriptSizeMultipliers|Scrollbars|ScrollingOptions|ScrollPosition|Sec|Sech|SechDistribution|SectionGrouping|SectorChart|SectorChart3D|SectorOrigin|SectorSpacing|SeedRandom|Select|Selectable|SelectComponents|SelectedCells|SelectedNotebook|SelectFirst|Selection|SelectionAnimate|SelectionCell|SelectionCellCreateCell|SelectionCellDefaultStyle|SelectionCellParentStyle|SelectionCreateCell|SelectionDebuggerTag|SelectionDuplicateCell|SelectionEvaluate|SelectionEvaluateCreateCell|SelectionMove|SelectionPlaceholder|SelectionSetStyle|SelectWithContents|SelfLoops|SelfLoopStyle|SemanticImport|SemanticImportString|SemanticInterpretation|SemialgebraicComponentInstances|SendMail|SendMessage|Sequence|SequenceAlignment|SequenceCases|SequenceCount|SequenceForm|SequenceHold|SequenceLimit|SequencePosition|Series|SeriesCoefficient|SeriesData|ServiceConnect|ServiceDisconnect|ServiceExecute|ServiceObject|SessionTime|Set|SetAccuracy|SetAlphaChannel|SetAttributes|Setbacks|SetBoxFormNamesPacket|SetCloudDirectory|SetDelayed|SetDirectory|SetEnvironment|SetEvaluationNotebook|SetFileDate|SetFileLoadingContext|SetNotebookStatusLine|SetOptions|SetOptionsPacket|SetPrecision|SetProperty|SetSelectedNotebook|SetSharedFunction|SetSharedVariable|SetSpeechParametersPacket|SetStreamPosition|SetSystemOptions|Setter|SetterBar|SetterBox|SetterBoxOptions|Setting|SetUsers|SetValue|Shading|Shallow|ShannonWavelet|ShapiroWilkTest|Share|Sharpen|ShearingMatrix|ShearingTransform|ShenCastanMatrix|Short|ShortDownArrow|Shortest|ShortestMatch|ShortestPathFunction|ShortLeftArrow|ShortRightArrow|ShortUpArrow|Show|ShowAutoStyles|ShowCellBracket|ShowCellLabel|ShowCellTags|ShowClosedCellArea|ShowContents|ShowControls|ShowCursorTracker|ShowGroupOpenCloseIcon|ShowGroupOpener|ShowInvisibleCharacters|ShowPageBreaks|ShowPredictiveInterface|ShowSelection|ShowShortBoxForm|ShowSpecialCharacters|ShowStringCharacters|ShowSyntaxStyles|ShrinkingDelay|ShrinkWrapBoundingBox|SiderealTime|SiegelTheta|SiegelTukeyTest|Sign|Signature|SignedRankTest|SignedRegionDistance|SignificanceLevel|SignPadding|SignTest|SimilarityRules|SimpleGraph|SimpleGraphQ|Simplex|Simplify|Sin|Sinc|SinghMaddalaDistribution|SingleEvaluation|SingleLetterItalics|SingleLetterStyle|SingularValueDecomposition|SingularValueList|SingularValuePlot|SingularValues|Sinh|SinhIntegral|SinIntegral|SixJSymbol|Skeleton|SkeletonTransform|SkellamDistribution|Skewness|SkewNormalDistribution|Skip|SliceDistribution|Slider|Slider2D|Slider2DBox|Slider2DBoxOptions|SliderBox|SliderBoxOptions|SlideView|Slot|SlotSequence|Small|SmallCircle|Smaller|SmithDelayCompensator|SmithWatermanSimilarity|SmoothDensityHistogram|SmoothHistogram|SmoothHistogram3D|SmoothKernelDistribution|SocialMediaData|Socket|SokalSneathDissimilarity|SolarEclipse|SolarSystemFeatureData|SolidData|Solve|SolveAlways|SolveDelayed|Sort|SortBy|Sound|SoundAndGraphics|SoundNote|SoundVolume|SourceEntityType|Sow|Space|SpaceCurveData|SpaceForm|Spacer|Spacings|Span|SpanAdjustments|SpanCharacterRounding|SpanFromAbove|SpanFromBoth|SpanFromLeft|SpanLineThickness|SpanMaxSize|SpanMinSize|SpanningCharacters|SpanSymmetric|SparseArray|SpatialGraphDistribution|Speak|SpeakTextPacket|SpearmanRankTest|SpearmanRho|SpeciesData|SpecificityGoal|Spectrogram|SpectrogramArray|Specularity|SpellingCorrection|SpellingDictionaries|SpellingDictionariesPath|SpellingOptions|SpellingSuggestionsPacket|Sphere|SphereBox|SphericalBesselJ|SphericalBesselY|SphericalHankelH1|SphericalHankelH2|SphericalHarmonicY|SphericalPlot3D|SphericalRegion|SpheroidalEigenvalue|SpheroidalJoiningFactor|SpheroidalPS|SpheroidalPSPrime|SpheroidalQS|SpheroidalQSPrime|SpheroidalRadialFactor|SpheroidalS1|SpheroidalS1Prime|SpheroidalS2|SpheroidalS2Prime|Splice|SplicedDistribution|SplineClosed|SplineDegree|SplineKnots|SplineWeights|Split|SplitBy|SpokenString|Sqrt|SqrtBox|SqrtBoxOptions|Square|SquaredEuclideanDistance|SquareFreeQ|SquareIntersection|SquareMatrixQ|SquaresR|SquareSubset|SquareSubsetEqual|SquareSuperset|SquareSupersetEqual|SquareUnion|SquareWave|SSSTriangle|StabilityMargins|StabilityMarginsStyle|StableDistribution|Stack|StackBegin|StackComplete|StackInhibit|StandardAtmosphereData|StandardDeviation|StandardDeviationFilter|StandardForm|Standardize|Standardized|StandbyDistribution|Star|StarClusterData|StarData|StarGraph|StartAsynchronousTask|StartingStepSize|StartOfLine|StartOfString|StartProcess|StartScheduledTask|StartupSound|StateDimensions|StateFeedbackGains|StateOutputEstimator|StateResponse|StateSpaceModel|StateSpaceRealization|StateSpaceTransform|StateTransformationLinearize|StationaryDistribution|StationaryWaveletPacketTransform|StationaryWaveletTransform|StatusArea|StatusCentrality|StepMonitor|StieltjesGamma|StirlingS1|StirlingS2|StopAsynchronousTask|StoppingPowerData|StopScheduledTask|StrataVariables|StratonovichProcess|StreamColorFunction|StreamColorFunctionScaling|StreamDensityPlot|StreamPlot|StreamPoints|StreamPosition|Streams|StreamScale|StreamStyle|String|StringBreak|StringByteCount|StringCases|StringContainsQ|StringCount|StringDelete|StringDrop|StringEndsQ|StringExpression|StringExtract|StringForm|StringFormat|StringFreeQ|StringInsert|StringJoin|StringLength|StringMatchQ|StringPadLeft|StringPadRight|StringPartition|StringPosition|StringQ|StringRepeat|StringReplace|StringReplaceList|StringReplacePart|StringReverse|StringRiffle|StringRotateLeft|StringRotateRight|StringSkeleton|StringSplit|StringStartsQ|StringTake|StringTemplate|StringToStream|StringTrim|StripBoxes|StripOnInput|StripWrapperBoxes|StrokeForm|StructuralImportance|StructuredArray|StructuredSelection|StruveH|StruveL|Stub|StudentTDistribution|Style|StyleBox|StyleBoxAutoDelete|StyleData|StyleDefinitions|StyleForm|StyleKeyMapping|StyleMenuListing|StyleNameDialogSettings|StyleNames|StylePrint|StyleSheetPath|Subdivide|Subfactorial|Subgraph|SubMinus|SubPlus|SubresultantPolynomialRemainders|SubresultantPolynomials|Subresultants|Subscript|SubscriptBox|SubscriptBoxOptions|Subscripted|Subset|SubsetEqual|SubsetQ|Subsets|SubStar|Subsuperscript|SubsuperscriptBox|SubsuperscriptBoxOptions|Subtract|SubtractFrom|SubValues|Succeeds|SucceedsEqual|SucceedsSlantEqual|SucceedsTilde|SuchThat|Sum|SumConvergence|Sunday|SunPosition|Sunrise|Sunset|SuperDagger|SuperMinus|SupernovaData|SuperPlus|Superscript|SuperscriptBox|SuperscriptBoxOptions|Superset|SupersetEqual|SuperStar|Surd|SurdForm|SurfaceColor|SurfaceData|SurfaceGraphics|SurvivalDistribution|SurvivalFunction|SurvivalModel|SurvivalModelFit|SuspendPacket|SuzukiDistribution|SuzukiGroupSuz|SwatchLegend|Switch|Symbol|SymbolName|SymletWavelet|Symmetric|SymmetricGroup|SymmetricKey|SymmetricMatrixQ|SymmetricPolynomial|SymmetricReduction|Symmetrize|SymmetrizedArray|SymmetrizedArrayRules|SymmetrizedDependentComponents|SymmetrizedIndependentComponents|SymmetrizedReplacePart|SynchronousInitialization|SynchronousUpdating|Syntax|SyntaxForm|SyntaxInformation|SyntaxLength|SyntaxPacket|SyntaxQ|SystemDialogInput|SystemException|SystemGet|SystemHelpPath|SystemInformation|SystemInformationData|SystemOpen|SystemOptions|SystemsModelDelay|SystemsModelDelayApproximate|SystemsModelDelete|SystemsModelDimensions|SystemsModelExtract|SystemsModelFeedbackConnect|SystemsModelLabels|SystemsModelLinearity|SystemsModelMerge|SystemsModelOrder|SystemsModelParallelConnect|SystemsModelSeriesConnect|SystemsModelStateFeedbackConnect|SystemsModelVectorRelativeOrders|SystemStub|Tab|TabFilling|Table|TableAlignments|TableDepth|TableDirections|TableForm|TableHeadings|TableSpacing|TableView|TableViewBox|TabSpacings|TabView|TabViewBox|TabViewBoxOptions|TagBox|TagBoxNote|TagBoxOptions|TaggingRules|TagSet|TagSetDelayed|TagStyle|TagUnset|Take|TakeLargest|TakeLargestBy|TakeSmallest|TakeSmallestBy|TakeWhile|Tally|Tan|Tanh|TargetFunctions|TargetUnits|TautologyQ|TelegraphProcess|TemplateApply|TemplateBox|TemplateBoxOptions|TemplateExpression|TemplateIf|TemplateObject|TemplateSequence|TemplateSlot|TemplateSlotSequence|TemplateUnevaluated|TemplateVerbatim|TemplateWith|TemporalData|TemporalRegularity|Temporary|TemporaryVariable|TensorContract|TensorDimensions|TensorExpand|TensorProduct|TensorQ|TensorRank|TensorReduce|TensorSymmetry|TensorTranspose|TensorWedge|TestID|TestReport|TestReportObject|TestResultObject|Tetrahedron|TetrahedronBox|TetrahedronBoxOptions|TeXForm|TeXSave|Text|Text3DBox|Text3DBoxOptions|TextAlignment|TextBand|TextBoundingBox|TextBox|TextCell|TextClipboardType|TextData|TextForm|TextJustification|TextLegend|TextLine|TextPacket|TextParagraph|TextRecognize|TextRendering|TextSentences|TextString|TextStyle|Texture|TextureCoordinateFunction|TextureCoordinateScaling|TextWords|Therefore|ThermodynamicData|ThermometerGauge|Thick|Thickness|Thin|Thinning|ThisLink|ThompsonGroupTh|Thread|ThreadDepth|ThreeJSymbol|Threshold|Through|Throw|Thumbnail|Thursday|Ticks|TicksStyle|Tilde|TildeEqual|TildeFullEqual|TildeTilde|TimeConstrained|TimeConstraint|TimeDirection|TimeFormat|TimelinePlot|TimeObject|TimeObjectQ|Timeout|Times|TimesBy|TimeSeries|TimeSeriesAggregate|TimeSeriesForecast|TimeSeriesInsert|TimeSeriesInvertibility|TimeSeriesMap|TimeSeriesMapThread|TimeSeriesModel|TimeSeriesModelFit|TimeSeriesResample|TimeSeriesRescale|TimeSeriesShift|TimeSeriesThread|TimeSeriesWindow|TimeUsed|TimeValue|TimeZone|TimeZoneConvert|Timing|Tiny|TitleGrouping|TitsGroupT|ToBoxes|ToCamelCase|ToCharacterCode|ToColor|ToContinuousTimeModel|ToDate|Today|ToDiscreteTimeModel|ToEntity|ToeplitzMatrix|ToExpression|ToFileName|Together|Toggle|ToggleFalse|Toggler|TogglerBar|TogglerBox|TogglerBoxOptions|ToHeldExpression|ToInvertibleTimeSeries|TokenWords|Tolerance|ToLowerCase|Tomorrow|ToNumberField|TooBig|Tooltip|TooltipBox|TooltipBoxOptions|TooltipDelay|TooltipStyle|Top|TopHatTransform|ToPolarCoordinates|TopologicalSort|ToRadicals|ToRules|ToSphericalCoordinates|ToString|Total|TotalHeight|TotalVariationFilter|TotalWidth|ToTitleCase|TouchPosition|TouchscreenAutoZoom|TouchscreenControlPlacement|ToUpperCase|Tr|Trace|TraceAbove|TraceAction|TraceBackward|TraceDepth|TraceDialog|TraceForward|TraceInternal|TraceLevel|TraceOff|TraceOn|TraceOriginal|TracePrint|TraceScan|TrackedSymbols|TrackingFunction|TradingChart|TraditionalForm|TraditionalFunctionNotation|TraditionalNotation|TraditionalOrder|TransferFunctionCancel|TransferFunctionExpand|TransferFunctionFactor|TransferFunctionModel|TransferFunctionPoles|TransferFunctionTransform|TransferFunctionZeros|TransformationClass|TransformationFunction|TransformationFunctions|TransformationMatrix|TransformedDistribution|TransformedField|TransformedProcess|TransformedRegion|TransitionDirection|TransitionDuration|TransitionEffect|TransitiveClosureGraph|TransitiveReductionGraph|Translate|TranslationTransform|Transparent|TransparentColor|Transpose|TrapSelection|TravelDirections|TravelDirectionsData|TravelDistance|TravelTime|TreeForm|TreeGraph|TreeGraphQ|TreePlot|TrendStyle|Triangle|TriangleWave|TriangularDistribution|TriangulateMesh|Trig|TrigExpand|TrigFactor|TrigFactorList|Trigger|TrigReduce|TrigToExp|TrimmedMean|TropicalStormData|TrueQ|TruncatedDistribution|TsallisQExponentialDistribution|TsallisQGaussianDistribution|TTest|Tube|TubeBezierCurveBox|TubeBezierCurveBoxOptions|TubeBox|TubeBoxOptions|TubeBSplineCurveBox|TubeBSplineCurveBoxOptions|Tuesday|TukeyLambdaDistribution|TukeyWindow|TunnelData|Tuples|TuranGraph|TuringMachine|TuttePolynomial|UnateQ|Uncompress|Undefined|UnderBar|Underflow|Underlined|Underoverscript|UnderoverscriptBox|UnderoverscriptBoxOptions|Underscript|UnderscriptBox|UnderscriptBoxOptions|UnderseaFeatureData|UndirectedEdge|UndirectedGraph|UndirectedGraphQ|UndoOptions|UndoTrackedVariables|Unequal|Unevaluated|UniformDistribution|UniformGraphDistribution|UniformSumDistribution|Uninstall|Union|UnionPlus|Unique|UnitaryMatrixQ|UnitBox|UnitConvert|UnitDimensions|Unitize|UnitRootTest|UnitSimplify|UnitStep|UnitSystem|UnitTriangle|UnitVector|UnityDimensions|UniversityData|UnixTime|Unprotect|UnsameQ|UnsavedVariables|Unset|UnsetShared|UntrackedVariables|Up|UpArrow|UpArrowBar|UpArrowDownArrow|Update|UpdateDynamicObjects|UpdateDynamicObjectsSynchronous|UpdateInterval|UpDownArrow|UpEquilibrium|UpperCaseQ|UpperLeftArrow|UpperRightArrow|UpperTriangularize|Upsample|UpSet|UpSetDelayed|UpTee|UpTeeArrow|UpValues|URL|URLBuild|URLDecode|URLDispatcher|URLEncode|URLExecute|URLExistsQ|URLExpand|URLFetch|URLFetchAsynchronous|URLParse|URLQueryDecode|URLQueryEncode|URLSave|URLSaveAsynchronous|URLShorten|UseGraphicsRange|UserDefinedWavelet|Using|UsingFrontEnd|UtilityFunction|V2Get|ValidationLength|ValidationSet|Value|ValueBox|ValueBoxOptions|ValueDimensions|ValueForm|ValueQ|Values|ValuesData|Variables|Variance|VarianceEquivalenceTest|VarianceEstimatorFunction|VarianceGammaDistribution|VarianceTest|VectorAngle|VectorColorFunction|VectorColorFunctionScaling|VectorDensityPlot|VectorGlyphData|VectorPlot|VectorPlot3D|VectorPoints|VectorQ|Vectors|VectorScale|VectorStyle|Vee|Verbatim|Verbose|VerboseConvertToPostScriptPacket|VerificationTest|VerifyConvergence|VerifySolutions|VerifyTestAssumptions|Version|VersionNumber|VertexAdd|VertexCapacity|VertexColors|VertexComponent|VertexConnectivity|VertexContract|VertexCoordinateRules|VertexCoordinates|VertexCorrelationSimilarity|VertexCosineSimilarity|VertexCount|VertexCoverQ|VertexDataCoordinates|VertexDegree|VertexDelete|VertexDiceSimilarity|VertexEccentricity|VertexInComponent|VertexInDegree|VertexIndex|VertexJaccardSimilarity|VertexLabeling|VertexLabels|VertexLabelStyle|VertexList|VertexNormals|VertexOutComponent|VertexOutDegree|VertexQ|VertexRenderingFunction|VertexReplace|VertexShape|VertexShapeFunction|VertexSize|VertexStyle|VertexTextureCoordinates|VertexWeight|Vertical|VerticalBar|VerticalForm|VerticalGauge|VerticalSeparator|VerticalSlider|VerticalTilde|ViewAngle|ViewCenter|ViewMatrix|ViewPoint|ViewPointSelectorSettings|ViewPort|ViewRange|ViewVector|ViewVertical|VirtualGroupData|Visible|VisibleCell|VoigtDistribution|VolcanoData|Volume|VonMisesDistribution|VoronoiMesh|WaitAll|WaitAsynchronousTask|WaitNext|WaitUntil|WakebyDistribution|WalleniusHypergeometricDistribution|WaringYuleDistribution|WatershedComponents|WatsonUSquareTest|WattsStrogatzGraphDistribution|WaveletBestBasis|WaveletFilterCoefficients|WaveletImagePlot|WaveletListPlot|WaveletMapIndexed|WaveletMatrixPlot|WaveletPhi|WaveletPsi|WaveletScale|WaveletScalogram|WaveletThreshold|WeaklyConnectedComponents|WeaklyConnectedGraphQ|WeakStationarity|WeatherData|WeberE|Webpage|Wedge|Wednesday|WeibullDistribution|WeierstrassHalfPeriods|WeierstrassInvariants|WeierstrassP|WeierstrassPPrime|WeierstrassSigma|WeierstrassZeta|WeightedAdjacencyGraph|WeightedAdjacencyMatrix|WeightedData|WeightedGraphQ|Weights|WelchWindow|WheelGraph|WhenEvent|Which|While|White|WhiteNoiseProcess|WhitePoint|Whitespace|WhitespaceCharacter|WhittakerM|WhittakerW|WienerFilter|WienerProcess|WignerD|WignerSemicircleDistribution|WikipediaData|WikipediaSearch|WilksW|WilksWTest|WindDirectionData|WindowClickSelect|WindowElements|WindowFloating|WindowFrame|WindowFrameElements|WindowMargins|WindowMovable|WindowOpacity|WindowSelected|WindowSize|WindowStatusArea|WindowTitle|WindowToolbars|WindowWidth|WindSpeedData|WindVectorData|With|WolframAlpha|WolframAlphaDate|WolframAlphaQuantity|WolframAlphaResult|Word|WordBoundary|WordCharacter|WordCloud|WordCount|WordCounts|WordData|WordOrientation|WordSearch|WordSeparators|WordSpacings|WordStem|WorkingPrecision|WrapAround|Write|WriteLine|WriteString|Wronskian|XMLElement|XMLObject|XMLTemplate|Xnor|Xor|XYZColor|Yellow|Yesterday|YuleDissimilarity|ZernikeR|ZeroSymmetric|ZeroTest|ZeroWidthTimes|Zeta|ZetaZero|ZIPCodeData|ZipfDistribution|ZTest|ZTransform|\\$Aborted|\\$ActivationGroupID|\\$ActivationKey|\\$ActivationUserRegistered|\\$AddOnsDirectory|\\$AssertFunction|\\$Assumptions|\\$AsynchronousTask|\\$BaseDirectory|\\$BatchInput|\\$BatchOutput|\\$BoxForms|\\$ByteOrdering|\\$Canceled|\\$CharacterEncoding|\\$CharacterEncodings|\\$CloudBase|\\$CloudConnected|\\$CloudCreditsAvailable|\\$CloudEvaluation|\\$CloudRootDirectory|\\$CloudSymbolBase|\\$CommandLine|\\$CompilationTarget|\\$ConditionHold|\\$ConfiguredKernels|\\$Context|\\$ContextPath|\\$ControlActiveSetting|\\$CreationDate|\\$CurrentLink|\\$DateStringFormat|\\$DefaultFont|\\$DefaultFrontEnd|\\$DefaultImagingDevice|\\$DefaultPath|\\$Display|\\$DisplayFunction|\\$DistributedContexts|\\$DynamicEvaluation|\\$Echo|\\$EmbedCodeEnvironments|\\$EmbeddableServices|\\$Epilog|\\$EvaluationCloudObject|\\$EvaluationEnvironment|\\$EvaluationEnvironmentParameters|\\$ExportFormats|\\$Failed|\\$FinancialDataSource|\\$FontFamilies|\\$FormatType|\\$FrontEnd|\\$FrontEndSession|\\$GeoEntityTypes|\\$GeoLocation|\\$GeoLocationCity|\\$GeoLocationCountry|\\$GeoLocationPrecision|\\$GeoLocationSource|\\$HistoryLength|\\$HomeDirectory|\\$HTMLExportRules|\\$HTTPCookies|\\$HTTPRequestData|\\$IgnoreEOF|\\$ImageFormattingWidth|\\$ImagingDevice|\\$ImagingDevices|\\$ImportFormats|\\$InitialDirectory|\\$Input|\\$InputFileName|\\$InputStreamMethods|\\$Inspector|\\$InstallationDate|\\$InstallationDirectory|\\$InterfaceEnvironment|\\$InterpreterTypes|\\$IterationLimit|\\$KernelCount|\\$KernelID|\\$Language|\\$LaunchDirectory|\\$LibraryPath|\\$LicenseExpirationDate|\\$LicenseID|\\$LicenseProcesses|\\$LicenseServer|\\$LicenseSubprocesses|\\$LicenseType|\\$Line|\\$Linked|\\$LinkSupported|\\$LoadedFiles|\\$MachineAddresses|\\$MachineDomain|\\$MachineDomains|\\$MachineEpsilon|\\$MachineID|\\$MachineName|\\$MachinePrecision|\\$MachineType|\\$MaxExtraPrecision|\\$MaxLicenseProcesses|\\$MaxLicenseSubprocesses|\\$MaxMachineNumber|\\$MaxNumber|\\$MaxPiecewiseCases|\\$MaxPrecision|\\$MaxRootDegree|\\$MessageGroups|\\$MessageList|\\$MessagePrePrint|\\$Messages|\\$MinMachineNumber|\\$MinNumber|\\$MinorReleaseNumber|\\$MinPrecision|\\$ModuleNumber|\\$NetworkLicense|\\$NewMessage|\\$NewSymbol|\\$Notebooks|\\$NumberMarks|\\$Off|\\$OperatingSystem|\\$Output|\\$OutputForms|\\$OutputSizeLimit|\\$OutputStreamMethods|\\$Packages|\\$ParentLink|\\$ParentProcessID|\\$PasswordFile|\\$PatchLevelID|\\$Path|\\$PathnameSeparator|\\$PerformanceGoal|\\$Permissions|\\$PermissionsGroupBase|\\$PipeSupported|\\$PlotTheme|\\$Post|\\$Pre|\\$PreferencesDirectory|\\$PrePrint|\\$PreRead|\\$PrintForms|\\$PrintLiteral|\\$ProcessID|\\$ProcessorCount|\\$ProcessorType|\\$ProductInformation|\\$ProgramName|\\$RandomState|\\$RecursionLimit|\\$RegisteredDeviceClasses|\\$RegisteredUserName|\\$ReleaseNumber|\\$RequesterAddress|\\$RequesterWolframID|\\$RequesterWolframUUID|\\$RootDirectory|\\$ScheduledTask|\\$ScriptCommandLine|\\$Services|\\$SessionID|\\$SetParentLink|\\$SharedFunctions|\\$SharedVariables|\\$SoundDisplay|\\$SoundDisplayFunction|\\$SuppressInputFormHeads|\\$SynchronousEvaluation|\\$SyntaxHandler|\\$System|\\$SystemCharacterEncoding|\\$SystemID|\\$SystemMemory|\\$SystemShell|\\$SystemWordLength|\\$TemplatePath|\\$TemporaryDirectory|\\$TemporaryPrefix|\\$TextStyle|\\$TimedOut|\\$TimeUnit|\\$TimeZone|\\$TopDirectory|\\$TraceOff|\\$TraceOn|\\$TracePattern|\\$TracePostAction|\\$TracePreAction|\\$UnitSystem|\\$Urgent|\\$UserAddOnsDirectory|\\$UserAgentLanguages|\\$UserAgentMachine|\\$UserAgentName|\\$UserAgentOperatingSystem|\\$UserAgentString|\\$UserAgentVersion|\\$UserBaseDirectory|\\$UserDocumentsDirectory|\\$UserName|\\$Version|\\$VersionNumber|\\$WolframID|\\$WolframUUID)\\b$")
    
    return re
  }

}