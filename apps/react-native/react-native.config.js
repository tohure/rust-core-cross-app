/**
 * @type {import('@react-native-community/cli-types').UserDependencyConfig}
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        // Sólo el CMakeLists del codegen de React Native (el spec del TurboModule).
        //
        // Las tres claves `cxxModule*` que traía el esqueleto de `react-native-builder-bob`
        // se quitaron: declaraban esta librería como **C++ TurboModule**, y no lo es. ubrn
        // genera un TurboModule **Kotlin** (`CoreFinancieroModule.kt`) cuyo `installRustCrate()`
        // instala los bindings JSI; no existe ninguna clase `CoreFinancieroImpl` ni el header
        // que la declaración prometía, y ubrn no menciona `cxxModule` en ninguna parte.
        //
        // Declararlas rompía de dos maneras a la vez: el autolinking metía nuestro
        // `android/CMakeLists.txt` como subdirectorio del build CMake de la app —donde
        // `CMAKE_SOURCE_DIR` deja de apuntar a nuestro módulo y el `.a` de Rust no se
        // encuentra— y además generaba un `autolinking.cpp` con `#include <CoreFinancieroImpl.h>`
        // que no compila. Sin ellas, el módulo librería construye su propio `.so` con su
        // `externalNativeBuild`, que es el camino para el que ubrn genera el CMakeLists.
        cmakeListsPath: 'generated/jni/CMakeLists.txt',
      },
    },
  },
};
