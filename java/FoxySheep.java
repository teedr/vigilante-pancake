import java.io.*;
import com.wolfram.eclipse.MEET.editors.sourcemodel.*;
import com.wolfram.eclipse.MEET.editors.MathematicaScanner;
import com.wolfram.eclipse.MEET.editors.ColorManager;
import com.wolfram.eclipse.MEET.editors.MathematicaConfiguration.*;
import com.wolfram.eclipse.MEET.editors.MathematicaDocument;
import com.wolfram.eclipse.MEET.projectmodel.MathematicaProjectModel;
import com.wolfram.eclipse.MEET.projectmodel.MathematicaProjectModelManager;
import com.wolfram.eclipse.MEET.editors.sourcemodel.variables.VariableData;
import com.wolfram.eclipse.MEET.editors.sourcemodel.variables.VariableDataResult;
import com.wolfram.eclipse.MEET.editors.sourcemodel.VariableLocator;
import com.wolfram.eclipse.MEET.editors.sourcemodel.variables.LocalVariableTester;
import com.wolfram.eclipse.MEET.utilities.*;
import com.wolfram.mexpr.MExpr;
import com.wolfram.mexpr.MSymbol;
import com.wolfram.mexpr.IMExprToken;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.Collection;
import java.util.Iterator;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;

public class FoxySheep {
	
	List localVariables_ = null;
	List<AtomToken> tokens_ = new ArrayList<AtomToken>();
	public MathematicaSourceModel model;
	VariableLocator varLocator_ = null;
	DocumentBuffer sourceBuffer_ = null;
	HashMap tokensMap_;
	HashMap localVariablesMap_;
	List changedLocalVariablePositions_ = new ArrayList();
	Boolean fullyParsed_ = false;
	
	public FoxySheep () {	 // constructor
		System.out.println("FoxySheep constructed");
	}
	
	public void parseFile(String inputFile) throws Exception {
				
		// if (args.length > 1) {
		// 	getVariableErrors = Boolean.parseBoolean(args[1]);
		// }

		InputStream in = new FileInputStream(inputFile);
		
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte['Ѐ'];
		int read = in.read(buf);
		
		while (read > 0) {
				out.write(buf, 0, read);
				read = in.read(buf);
		}
		
		String str = out.toString();
		
		buildModelFromText(str);
		
		parse(0);
		
	}
	
	public void buildModelFromText(String text) {
		sourceBuffer_ = new DocumentBuffer(text);
		model = new MathematicaSourceModel(sourceBuffer_,true);
		model.setIncrementalLexing(false);
		getLocalVariablesMap();
		//getVariableLocator();
	}
	
	public void parseText(String text) throws Exception {
		buildModelFromText(text);
		parse(0);
	}
	
	public void parse(int start) throws Exception {
		
		tokens_ = new ArrayList<AtomToken>();
		tokensMap_ = new HashMap();
		
		System.out.println("TOKS:");
		int i=start;
		while (true) {
			IMExprToken tok = null;
			try {
				tok = model.getToken(i);
			}
			catch (Exception ex) {
				break;
			}
			if (tok == null) {
				break;
			}
			if (tok.getText() == null || ((tok.getCharEnd() - tok.getCharStart() + 1) != tok.getText().length())) {
				//tokens_.add(null);
				i++;
				continue;
			}
			VariableData varResult = (VariableData)localVariablesMap_.get(tok.getCharStart());

			if (varResult == null) {
				AtomToken atomTok = new AtomToken(tok, false, i);
				tokens_.add(atomTok);
				tokensMap_.put(i,atomTok);
			} else {
				AtomToken atomTok = new AtomToken(tok, true, i);
				tokens_.add(atomTok);
				tokensMap_.put(i,atomTok);
			}
			i++;
		}
	}
	
	public int getFixedStartTokenIndex(int initialIndex) {

		IMExprToken tok = model.getToken(initialIndex);
		
		if (tok == null) {
			return -1;
		}
		
		if (!(tok.getText() == null || ((tok.getCharEnd() - tok.getCharStart() + 1) != tok.getText().length()))) {
			return initialIndex;
		}
		
		int fixedIndex = initialIndex + 1;
		return getFixedStartTokenIndex(fixedIndex);
	} 
	
	public int getFixedEndTokenIndex(int initialIndex) {
		
		IMExprToken tok;
		try {
			tok = model.getToken(initialIndex);
		}
		catch (Exception ex) {
			return initialIndex;
		}
		
		if (tok == null) {
			return initialIndex;
		}
				
		if (!(tok.getText() == null || ((tok.getCharEnd() - tok.getCharStart() + 1) != tok.getText().length()))) {
			return initialIndex;
		}
		
		int fixedIndex = initialIndex + 1;
		return getFixedEndTokenIndex(fixedIndex);
	} 
	
	public AtomToken[] getAtomTokensForRange(int startOffset, int endOffset) {
		
		int startIndex = model.getTokenIndexForOffset(startOffset);
		int endIndex = model.getTokenIndexForOffset(endOffset);
		
		int fixedStartIndex = getFixedEndTokenIndex(startIndex);
		int fixedEndIndex = getFixedEndTokenIndex(endIndex);
		
		List<AtomToken> newTokens = new ArrayList<AtomToken>();
		
		for (int i = fixedStartIndex; i <= fixedEndIndex ; i++) {
			IMExprToken tok = null;
			try {
				tok = model.getToken(i);
			}
			catch (Exception ex) {
				break;
			}
			if (tok == null) {
				continue;
			}
			if (tok.getText() == null || ((tok.getCharEnd() - tok.getCharStart() + 1) != tok.getText().length())) {
				continue;
			}
			VariableData varResult = (VariableData)localVariablesMap_.get(tok.getCharStart());

			if (varResult == null) {
				AtomToken atomTok = new AtomToken(tok, false, i);
				newTokens.add(atomTok);
			} else {
				AtomToken atomTok = new AtomToken(tok, true, i);
				newTokens.add(atomTok);
			}
		}
		
		return newTokens.toArray(new AtomToken[newTokens.size()]);
	}
	
	public void parseIncr(int offset, int length, int newLength, SourceBufferChangeEvent event) throws Exception {
		int startIndex = getTokenIndexForOffset(offset);
		int endIndex = getTokenIndexForOffset(offset+length);
		//int endIndex = tokens_.size() - 1;
		
		int modelStartIndex = model.getTokenIndexForOffset(offset);
		int modelEndIndex = model.getTokenIndexForOffset(offset+newLength);
		
		List<AtomToken> newTokens = new ArrayList<AtomToken>();
		
		for (int i = modelStartIndex; i <= modelEndIndex; i++) {
			IMExprToken tok = null;
			try {
				tok = model.getToken(i);
			}
			catch (Exception ex) {
				break;
			}
			if (tok == null) {
				break;
			}
			if (tok.getText() == null || ((tok.getCharEnd() - tok.getCharStart() + 1) != tok.getText().length())) {
				i++;
				continue;
			}
			VariableData varResult = (VariableData)localVariablesMap_.get(tok.getCharStart());
	
			if (varResult == null) {
				newTokens.add(new AtomToken(tok, false, i));
			} else {
				newTokens.add(new AtomToken(tok, true, i));
			}
		}
		
		int fixIndex = newTokens.size() - (endIndex - startIndex + 1);
		int[] vals = getTextFix(event);
		
		fixTokenPositions(endIndex, vals[2], fixIndex);
		
		tokens_.subList(startIndex, endIndex).clear();
		tokens_.addAll(startIndex, newTokens);
		
	}
	
	public int[] bufferChanged(String text, int offset, int length, String newText, Boolean parseVars) throws Exception {
		sourceBuffer_.set(text);
		
		SourceBufferChangeEvent changeEvent = new BufferChangeEvent(sourceBuffer_,offset,length,newText);
		
		int[] span = new int[2];
		
		int minOffset = changeEvent.getMinOffset();
		int maxLength = changeEvent.getMaxLength();
		
		if (!parseVars) {
			sourceBuffer_.fireChangeEvent(changeEvent);
			parse(0);
			span[0] = minOffset;
			span[1] = maxLength;
			return span;
		}
		
		model.addDocumentEvent(changeEvent);
		
		sourceBuffer_.fireChangeEvent(changeEvent);
		ModelRegion updatedRegion;
		
		if (!parseVars) {
			parse(0);
			span[0] = minOffset;
			span[1] = maxLength;
			return span;
		}
		
		try {
			updatedRegion = model.checkVars(minOffset,maxLength);
		} catch (Exception ex) {
			updatedRegion = null;
			System.out.println(ex);
		}
		getLocalVariablesMap();
		
		parse(0);
		
		if (updatedRegion == null) {
			span[0] = -1;
			span[1] = 0;
			return span;
		}
		
		span[0] = updatedRegion.getOffset();
		span[1] = updatedRegion.getLength();
		
		return span;
	}
	
	private int[] getTextFix(SourceBufferChangeEvent event) {
		int start = event.getOffset();
		int end = start + event.getLength();
		int fixLen = event.getTextLength() - event.getLength();
		return new int[] { start, end, fixLen };
	}
	
	private void fixTokenPositions(int start, int fixLen, int fixIndex) {
		for (int i = start; i < tokens_.size(); i++) {
			AtomToken token = (AtomToken)tokens_.get(i);
			IMExprToken tok = token.tok;
			tok.fixTokenPosition(fixLen, fixIndex);
			token.start = (tok.getCharStart());
			token.end = (tok.getCharEnd());
		}
		
	}
	
	public void tokenizeChange(String text, int offset, int length, String newText, Boolean parseVars) throws Exception {
		sourceBuffer_.set(text);
		
		SourceBufferChangeEvent changeEvent = new BufferChangeEvent(sourceBuffer_,offset,length,newText);
		
		int minOffset = changeEvent.getMinOffset();
		int maxLength = changeEvent.getMaxLength();

		//model.addDocumentEvent(changeEvent);
		sourceBuffer_.fireChangeEvent(changeEvent);
		
		fullyParsed_ = false;
		
		return;
	}
	
	public void parseChanges() throws Exception {
		getLocalVariablesMap();
		parse(0);
		return;
	}
	
	public int[] parseChange(int offset, int length, String newText) throws Exception {
		
		SourceBufferChangeEvent changeEvent = new BufferChangeEvent(sourceBuffer_,offset,length,newText);
		
		int[] span = new int[2];
		
		int minOffset = changeEvent.getMinOffset();
		int maxLength = changeEvent.getMaxLength();
		
		ModelRegion updatedRegion;
		try {
			updatedRegion = model.checkVars(minOffset,maxLength);
		} catch (Exception ex) {
			updatedRegion = null;
			System.out.println(ex);
		}
		Expression expression = model.getRootExpressionForOffset(offset);
		if (expression == null) {
			span[0] = -1;
			span[1] = 0;
		} else {
			span = expression.getSourceRange();
		}
		
		getLocalVariablesMap();

		return span;
	}
	
	public void bufferDoneChanging(int offset, int length) throws Exception {
		try {
			model.checkVars(offset,length);
		} catch (Exception ex) {
			System.out.println(ex);
		}
		
		parse(0);
	}
	
	public class BufferChangeEvent implements SourceBufferChangeEvent {
		SourceBuffer src_;
		private final int length_;
		private final int offset_;
		int maxLength_;
		int minOffset_;
		private final String newText_;
		
		public BufferChangeEvent(SourceBuffer s, int offset, int length, String newText)
		{
			src_ = s;
			offset_ = offset;
			length_ = length;
			minOffset_ = -1;
			maxLength_ = -1;
			newText_ = newText;
		}
		
		public SourceBuffer getSource() {
			return src_;
		}
		
		public int getChangeNumber() {
			return 0;
		}
		
		public int getLength(int i) {
			return length_;
		}
		
		public int getOffset(int i) {
			return offset_;
		}
		
		public int getLength() {
			return length_;
		}
		
		public int getOffset() {
			return offset_;
		}
		


		public int getTextLength()
		{
			return newText_.length();
		}
		
		public int getMaxLength() {
			if (maxLength_ == -1) {
				calculate();
			}
			return maxLength_;
		}
		
		public int getMinOffset() {
			if (minOffset_ == -1) {
				calculate();
			}
			return minOffset_;
		}
		
		void calculate() {

			int testMin = offset_;
			if (length_ > 0 && testMin > 0) {
				testMin--;
			}
			
			String text = newText_;
			int len = text == null ? 0 : text.length();
			if (len == 0) {
				len = 2;
			}
			int testMax = testMin + len;
			minOffset_ = testMin;
			int maxOffset = testMax;
			
			maxLength_ = (maxOffset - minOffset_ + 1);
		}
	}
	
	public class DocumentBuffer
	extends AbstractSourceBuffer {
		
		private String fStore;
		
		public DocumentBuffer(String content) {
			fStore = content;
		}
		
		public void fireChangeEvent(SourceBufferChangeEvent changeEvent) throws Exception {
			fireEvent(changeEvent);
		}
		
		public int getLength() {
			return fStore.length();
		}

		public char getCharAt(int i) {
			return fStore.charAt(i);
		}



		public void putCharAt(int pos, char value) {}



		public void replace(int offset, int length, String text) {}



		public String toString()
		{
			return fStore;
		}

		public String get(int pos, int len) {
			return fStore.substring(pos, pos + len);
		}


		public void set(String text) {
			fStore = text;
		}


		public int getLineOfOffset(int offset)
		{
			return 0;
		}
		
	}
	
	public class AtomToken {
		// expect an array of arrays of objects with objects {Object} containing:
		// * `text` The {String} tokenized text
		// * `type` The type ID of token
		// * `charStart` The start index of the token
		// * `charEnd` The end index of the token
		// * `length` The length of the text within the token
		public String text;
		public int scopeInt;
		public int index;
		public Boolean scopedVar;
		public int start;
		public int end;
		public int len;
		public IMExprToken tok;
		
		public AtomToken(MExpr expr, Boolean scopedVariable) {
			
			if (expr.sameQ(MExpr.NULLexpr)) {
				return;
			}
			
			start = model.startPositionFromTokenIndex(expr);
			end = model.endPositionFromTokenIndex(expr);
			
			if (scopedVariable) {
				scopedVar = true;
			} else {
				scopedVar = false;
			}
			
			text = expr.toString();
			
			if (expr.sameQ(MExpr.STRINGexpr)) {
				scopeInt = 99;
			} else {
				scopeInt = 86;
			}
			
			len = end-start;
			
		}
		
		public AtomToken(IMExprToken token, Boolean scopedVariable, int ind) {
			tok = token;
			start = (token.getCharStart());
			text = token.getText();
			index = ind;
			
			if (text != null) {
				len = text.length();
			} else {
				len = 0;
			}
			
			end = (start + len);
			//end = (token.getCharEnd());
			System.out.println("ihihihi");
			System.out.println(end);
			
			scopeInt = token.getType();
			
			if (scopedVariable) {
				scopedVar = true;
			} else {
				scopedVar = false;
			}
		}
	}
	
	public class AtomError {
		public String description;
		public String longText;
		public int start;
		public int end;
		public Boolean warning;
		
		public AtomError(SyntaxError error) {
			
			description = error.getDescription();
			longText = error.getLongText();
			start = error.getCharStart();
			end = error.getCharEnd();
			warning = error.isWarning();
		}
	}
	
	private VariableLocator getVariableLocator() {
		if (varLocator_ == null) {
			varLocator_ = new VariableLocator(model);
			varLocator_.getLockObject();
			varLocator_.startScan(0);
		}
		return varLocator_;
	}
	
	public HashMap getLocalVariablesMap() {
		
		if (fullyParsed_) {
			return localVariablesMap_;
		}
		
		localVariablesMap_ = new HashMap();
		
		List localVariables = model.getLocalVariables();
		
		for (int i = 0; i < localVariables.size(); i++) {
			VariableData var = (VariableData)localVariables.get(i);
			int tokenIndex = var.fVariable.getCharStart();
			int startOffset = model.startPositionFromTokenIndex(var.fVariable);
			localVariablesMap_.put(startOffset,var);
		}
		
		fullyParsed_ = true;
		
		return localVariablesMap_;
		
	}
	
	public AtomError[] getErrors() {
		
		Collection collection = model.getErrors();
		
		AtomError[] atomErrors = new AtomError[collection.size()];
		
		for (int i = 0; i < collection.size(); i++) {
			SyntaxError err = (SyntaxError)collection.toArray()[i];
		  AtomError atomError = new AtomError(err);
			atomErrors[i] = atomError;
		}
		
		return atomErrors;
	}
	
	public void fixLocalVariablePositions() {
		
		HashMap updatedMap = new HashMap();
		Map<Integer, VariableData> map = (Map)localVariablesMap_;
		
		for (Map.Entry<Integer, VariableData> entry : map.entrySet()) {
			VariableData var = (VariableData)entry.getValue();
			int newStartOffset = model.startPositionFromTokenIndex(var.fVariable);
			//int newIndex = model.getTokenIndexForOffset(newStartOffset);
			updatedMap.put(newStartOffset,var);
		}
		
		localVariablesMap_ = updatedMap;
		
	}
		
	public AtomToken[] getTokens() {
		AtomToken[] tokList = new AtomToken[tokens_.size()];
		for (int i = 0; i < tokens_.size(); i++) {
			AtomToken tok = (AtomToken)tokens_.get(i);
			tokList[i] = tok;
		}
		return tokList;
	}
	
	public AtomToken getTokenForIndex(int index) {
		AtomToken tok = (AtomToken)tokens_.get(index);
		return tok;
	}
	
	public AtomToken getTokenForOffset(int offset) {
		int modelIndex = model.getTokenIndexForOffset(offset);
		int fixedIndex = getFixedStartTokenIndex(modelIndex);
		
		if (fixedIndex == -1) {
			return null;
		}
		
		IMExprToken modelToken = model.getToken(fixedIndex);

		return new AtomToken(modelToken, false, fixedIndex);

	}
	
	public int getTokenIndexForOffset(int offset)
	{
		int size = tokens_.size() - 1;
		int min = 0;
		int max = size;
		int pos = max / 2;
		
		AtomToken firstToken = ((AtomToken)tokens_.get(0));
		AtomToken finalToken = ((AtomToken)tokens_.get(size));
		
		if (firstToken != null && offset <= firstToken.start) {
			return 0;
		}
		if (finalToken!=null && offset >= finalToken.start) {
			return size;
		}
		
		while (min < max) {
			AtomToken tok = (AtomToken)tokens_.get(pos);
			if (tok.start <= offset) {
				if (offset <= tok.end) {
					return pos;
				}
				if (pos < size) {
					AtomToken nextToken = ((AtomToken)tokens_.get(pos + 1));
					if (nextToken != null && offset < nextToken.start) {
						return pos + 1;
					}
				}
				int oldpos = pos;
				pos = (max + pos) / 2;
				if (pos == oldpos) {
					pos = max;
				}
				min = oldpos;
			} else {
				if (pos > 0) {
					AtomToken lastToken = ((AtomToken)tokens_.get(pos - 1));
					if (lastToken != null && lastToken.end < offset) {
						return pos;
					}
				}
				
				int oldpos = pos;
				pos = (pos + min) / 2;
				max = oldpos;
			}
		}
		
		return -1;
	}
	
	public int getModelTokenIndexForOffset(int offset)
	{
		int size = tokens_.size() - 1;
		int min = 0;
		int max = size;
		int pos = max / 2;
		
		AtomToken firstToken = ((AtomToken)tokens_.get(0));
		AtomToken finalToken = ((AtomToken)tokens_.get(size));
		
		if (firstToken != null && offset <= firstToken.start) {
			return 0;
		}
		if (finalToken!=null && offset >= finalToken.start) {
			return size;
		}
		
		while (min < max) {
			AtomToken tok = (AtomToken)tokens_.get(pos);
			if (tok.start <= offset) {
				if (offset <= tok.end) {
					return tok.index;
				}
				if (pos < size) {
					AtomToken nextToken = ((AtomToken)tokens_.get(pos + 1));
					if (nextToken != null && offset < nextToken.start) {
						return nextToken.index + 1;
					}
				}
				int oldpos = pos;
				pos = (max + pos) / 2;
				if (pos == oldpos) {
					pos = max;
				}
				min = oldpos;
			} else {
				if (pos > 0) {
					AtomToken lastToken = ((AtomToken)tokens_.get(pos - 1));
					if (lastToken != null && lastToken.end < offset) {
						return tok.index;
					}
				}
				
				int oldpos = pos;
				pos = (pos + min) / 2;
				max = oldpos;
			}
		}
		
		return -1;
	}

	
	public VariableData[] getLocalVariables() {
		
		VariableData[] dat = new VariableData[localVariables_.size()];
		System.out.println(dat.length);
		for (int i = 0; i < dat.length; i++) {
			VariableData expr = (VariableData)(localVariables_.toArray()[i]);
			dat[i] = expr;
		}
		
		return dat;
	}

}
