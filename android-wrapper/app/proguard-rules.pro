# CrewCheck produção premium — R8/ProGuard
# Mantém os pontos nativos usados por WebView/Telegram/Android para evitar quebra após minificação.

# Mantém line numbers para o mapping.txt ficar útil na Play Console/ReTrace.
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# WebView JavaScript bridges: os nomes chamados pelo JavaScript precisam permanecer estáveis.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.crewcheck.app.MainActivity$CrewCheckIFlightBridge { *; }
-keep class com.crewcheck.app.MainActivity$CrewCheckNativeBridge { *; }
-keep class com.crewcheck.app.MainActivity$CrewCheckIFlightPortalBridge { *; }
-keep class com.crewcheck.app.CrewCheckHealthBridge { *; }

# Componentes Android declarados no Manifest.
-keep class com.crewcheck.app.MainActivity { *; }
-keep class com.crewcheck.app.CrewCheckNotificationReceiver { *; }

# Segurança contra otimização agressiva em callbacks/reflection de plataforma.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

-dontwarn org.json.**
