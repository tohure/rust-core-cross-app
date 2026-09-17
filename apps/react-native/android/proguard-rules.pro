# Reglas que este módulo le impone a quien lo consuma (`consumerProguardFiles`, android/build.gradle:70).
#
# Está vacío a propósito, y el archivo existe porque **sin él no se puede construir un release**:
# AGP falla con `Supplied consumer proguard configuration does not exist` aunque R8 esté apagado.
# La declaración vive en `android/build.gradle`, que **lo genera `ubrn`** y está gitignored: el
# cambio no se puede hacer allá porque el siguiente `pnpm ubrn:android` se lo lleva. Este archivo,
# en cambio, no se genera — se commitea.
#
# Vacío es correcto hoy: el `example` lleva `enableProguardInReleaseBuilds = false`, igual que la
# app nativa de Android (`optimization { enable = false }`), porque es una POC y un APK minificado
# complica leer un stack trace en la demo.
#
# **Si alguna vez se prende R8, esto deja de poder estar vacío.** El borde de este módulo es un
# turbo module JSI: los métodos nativos se resuelven por nombre desde C++, así que el shrinker no
# ve quién los usa y se los lleva. Ahí hacen falta keeps para el paquete de los bindings generados.
