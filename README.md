# vigilante-pancake

vigilante-pancake is a mathematica lexer and parser capable of semantic highlighting mirroring _mathematica_'s or _workbench_'s editor

![variable scoping](https://i.imgur.com/WgtINlD.png)

![error recognition](https://i.imgur.com/386u34G.png)

## Installation

### Dependencies
- Automated installation of all dependencies is proving to be reliably unreliable
- The following prerequisites are a manual installation of [`node-java`](https://github.com/joeferner/node-java) so if already have `node-java` installed or prefer to install it using your own methods, you can skip these steps

#### JDK
The Java JDK must be installed (not just the JRE)

##### OSX
- Accept the License Agreement and download/install the first _"macOS"_ version [here](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)

##### Windows
The 32-bit version is required and the JAVA_HOME system variable must be set
- Accept the License Agreement and download/install the first _"Windows x86"_ version [here](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)

#### Node
Follow the install instructions found [here](https://nodejs.org)

#### node-gyp
Follow the install instructions found [here](https://github.com/nodejs/node-gyp)

Notes:
- node-gyp requires python 2.x not python 3.x
- [This issue](https://github.com/TooTallNate/node-gyp/issues/155) may be helpful for a common error during windows install

#### node-java
Follow the install instructions found [here](https://github.com/joeferner/node-java)

Notes:
- The `node-java` install instructions includes some instructions for `node-gyp` installation. If you are having trouble installing `node-gyp`, the suggestions on `node-java`'s readme may be useful.

### Plugin Installation
- At the point, the remaining dependencies can be installed automatically via plugin installation

To install the plugin: 
1. clone repository to some location on your machine
2. `cd` to the cloned repository
3. run `apm install`
4. run `apm link`
5. if atom is already open, restart atom
6. open a `.m` file in atom

Notes:
- To reliably default to this plugin for syntax highlighting, you may want to disable any other installed mathematica grammar packages and restart atom. For more information see [below](https://github.com/teedr/vigilante-pancake#conflicting-grammars).

## Known Issues

#### Conflicting Grammars
- At the moment, this grammar doesn't play super well with existing [mathematica grammars](https://github.com/Fitzse/language-mathematica)
- If an open `.m` file editor is using a different grammar, switching to _Mathematica (Semantic Highlighting)_ will not re-highlight the file
- It should, however, properly highlight if you reload the workspace (cmd (cntrl) + shift + p -> "_Window: Reload_")

#### Open Issues
- Other known open issues can be found [here](https://github.com/teedr/vigilante-pancake/issues)
- Filing an issue for any bugs/problems is very helpful!

