package io.github.fnskd.harukana;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * 하루가나 안드로이드 앱.
 * APK 안에 들어 있는 웹앱(index.html 등)을 WebView 로 보여주고,
 * 웹만으로는 안 되는 기능(휴대폰 음성, 진동, 파일 보내기·고르기)을 안드로이드 기능으로 이어 줘요.
 */
public class MainActivity extends Activity {
    // 앱 안의 파일을 https 주소처럼 열어 주는 가상 주소 (인터넷에 접속하지 않아요)
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int PICK_FILE = 7;

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        paintSystemBars();

        web = new WebView(this);
        setContentView(web);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // 공부 기록 저장 (localStorage)
        s.setMediaPlaybackRequiresUserGesture(false); // 캐릭터 목소리 재생
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "HarukanaAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;   // 앱 안의 화면
                // 유튜브 등 바깥 링크는 유튜브 앱이나 브라우저로 열어요
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // "기록 파일 불러오기" 버튼 → 휴대폰의 파일 고르기 화면
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "기록 파일 고르기"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // 휴대폰 음성(TTS): 캐릭터 목소리를 끄거나 소리 파일이 없는 말을 읽을 때 써요
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(Locale.JAPAN);
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /** 위쪽 상태 표시줄과 아래쪽 내비게이션 바를 사쿠라 색으로 */
    private void paintSystemBars() {
        Window w = getWindow();
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        w.setStatusBarColor(Color.parseColor(night ? "#1C1218" : "#FDE8EF"));
        w.setNavigationBarColor(Color.parseColor(night ? "#1C1218" : "#FFF2F6"));
        if (!night) {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            w.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            result = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    /** 휴대폰 뒤로 가기 버튼: 앱 안에서 이전 화면으로 */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** 웹앱(app.js)에서 window.HarukanaAndroid.xxx() 로 부르는 기능들 */
    private class Bridge {
        @JavascriptInterface
        public void speak(String text, float rate, float pitch) {
            if (tts == null) return;
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "harukana");
        }

        @JavascriptInterface
        public boolean isTtsReady() {
            return ttsReady;
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }

        /** 기록 백업 파일을 "공유" 화면으로 보내요 (내 파일·드라이브 등에 저장) */
        @JavascriptInterface
        public void shareFile(String name, String content) {
            runOnUiThread(() -> {
                try {
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists() && !dir.mkdirs()) return;
                    File f = new File(dir, name);
                    try (FileOutputStream out = new FileOutputStream(f)) {
                        out.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("application/json");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "기록 파일 저장하기"));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
