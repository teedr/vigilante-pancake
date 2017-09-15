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
import com.wolfram.eclipse.MEET.utilities.*;
import com.wolfram.mexpr.MExpr;
import com.wolfram.mexpr.MSymbol;
import com.wolfram.mexpr.IMExprToken;
import java.io.ByteArrayOutputStream;
import java.util.Iterator;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;

public class FoxySheep {
	
	List localVariables_ = null;
	ArrayList tokens_ = new ArrayList();
	public MathematicaSourceModel model;
	VariableLocator varLocator_ = null;
	DocumentBuffer sourceBuffer_ = null;
	
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
		
		parse();
		
	}
	
	public void buildModelFromText(String text) {
		
		sourceBuffer_ = new DocumentBuffer(text);
		model = new MathematicaSourceModel(sourceBuffer_,true);
		model.setIncrementalLexing(true);
		
	}
	
	public void parseText(String text) throws Exception {
		buildModelFromText(text);
		parse();
	}
	
	public void parse() throws Exception {
		
		tokens_ = new ArrayList();
		
		VariableLocator varLocator = getVariableLocator();
		System.out.println(varLocator);
		
		try {
			Object lock = varLocator.getLockObject();
			varLocator.startScan(0);
		} catch (Exception ex) {
			System.out.println(ex);
		}
		
		System.out.println("TOKS:");
		int i=0;
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
				i++;
				continue;
			}
			VariableDataResult varResult = varLocator.getLength(tok.getCharStart());
			if (varResult == null) {
				System.out.println("NONLOCAL");
				System.out.println(tok.getText());
				tokens_.add(new AtomToken(tok, false));
			} else {
				System.out.println("LOCAL");
				tokens_.add(new AtomToken(tok, true));
			}
			i++;
		}
	}
	
	public void bufferChanged(String text, int offset, int length) throws Exception {
		SourceBufferChangeEvent changeEvent = new DefaultSourceBufferChangeEvent(sourceBuffer_,offset-1,length+1,offset-1,length+1);
		sourceBuffer_.set(text);
		model.addDocumentEvent(changeEvent);
		sourceBuffer_.fireChangeEvent(changeEvent);
		try {
			model.checkVars(offset,length);
		} catch (Exception ex) {
			System.out.println(ex);
		}
		
		parse();
	}
	
	public void bufferDoneChanging(int offset, int length) throws Exception {
		try {
			model.checkVars(offset,length);
		} catch (Exception ex) {
			System.out.println(ex);
		}
		
		parse();
	}
	
	public class DocumentBuffer
	extends AbstractSourceBuffer {
		
		private String fStore;
		
		public DocumentBuffer(String content) {
			fStore = content;
		}
		
		public void fireChangeEvent(SourceBufferChangeEvent changeEvent) throws Exception {
			
			//SourceBuffer updatedBuffer = new StringSourceBufferImpl(text);
			fireEvent(changeEvent);
			//model.bufferChanged(changeEvent);
			
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
		public Boolean scopedVar;
		public int start;
		public int end;
		public int len;
		public IMExprToken tok;
		
		public AtomToken(IMExprToken token, Boolean scopedVariable) {
			tok = token;
			start = (token.getCharStart());
			text = token.getText();
			
			if (text != null) {
				len = text.length();
			} else {
				len = 0;
			}
			
			//end = (start + len);
			end = (token.getCharEnd());
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
	
	private VariableLocator getVariableLocator() {
		if (varLocator_ == null) {
			varLocator_ = new VariableLocator(model);
		}
		return varLocator_;
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
		int index = getTokenIndexForOffset(offset);
		AtomToken tok = getTokenForIndex(index);
		return tok;
	}
	
	public int getTokenIndexForOffset(int offset)
	{
		int size = tokens_.size() - 1;
		int min = 0;
		int max = size;
		int pos = max / 2;
		

		if (offset <= ((AtomToken)tokens_.get(0)).start) {
			return 0;
		}
		if (offset >= ((AtomToken)tokens_.get(size)).start) {
			return size;
		}
		
		while (min < max) {
			AtomToken tok = (AtomToken)tokens_.get(pos);
			if (tok.start <= offset) {
				if (offset <= tok.end) {
					return pos;
				}
				if ((pos < size) && 
					(offset < ((AtomToken)tokens_.get(pos + 1)).start)) {
					return pos + 1;
				}
				int oldpos = pos;
				pos = (max + pos) / 2;
				if (pos == oldpos) {
					pos = max;
				}
				min = oldpos;
			} else {
				if ((pos > 0) && 
					(((AtomToken)tokens_.get(pos - 1)).end < offset)) {
					return pos;
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
		
		// for (Object o : localVariables_) {	
		// 	VariableData expr = (VariableData)o;
		// 	System.out.println(expr);
		// 	System.out.println(expr.fVariable.getCharStart());
		// 	dat.add(expr);
		// 	System.out.println(expr.fVariable.getCharEnd());
		// 	// variableLocator.startScan(expr.fVariable.getCharEnd());
		// 	// VariableDataResult varResult = variableLocator.getLength(expr.fVariable.getCharEnd());
		// 	// System.out.println(varResult.fType);
		// }
		
		return dat;
	}

}
