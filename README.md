# Mathematica Lexer/Parser

## Installation:

### Prerequisites

#### JDK
The Java JDK must be installed (not just the JRE)

##### On Mac
- Accept the License Agreement and download/install the first _"macOS"_ version [here](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)

##### On Windows
The 32-bit version is required and the JAVA_HOME system variable must be set
- Accept the License Agreement and download/install the first _"Windows x86"_ version [here](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)


#### Node
[Node](https://nodejs.org) must be installed

#### node-gyp
Follow the install instructions found here: https://github.com/nodejs/node-gyp
- node-gyp requires python 2.x not python 3.x
- [This issue](https://github.com/TooTallNate/node-gyp/issues/155) may be helpful for a common error during windows install

### Plugin Installation
1. clone repository to some location
2. run `apm install`
3. run `apm link`
4. restart atom
5. open a `.m` file in atom

## Known Issues

#### Conflicting Grammars
- At the moment, this grammar doesn't play super well with existing [mathematica grammars](https://github.com/Fitzse/language-mathematica)
- If an open `.m` file editor is using a different grammar, switching to _Mathematica (Semantic Highlighting)_ will not re-highlight the file
- It should, however, properly highlight if you reload the workspace (cmd (cntrl) + shift + p -> "_Window: Reload_")

#### Open Issues
- Other known issues can be found [here](https://github.com/teedr/vigilante-pancake/issues)
