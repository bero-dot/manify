# Manify PWA — GitHub + Render Kurulum Rehberi

Bu rehber, `manify-pwa` klasörünü bir GitHub reposuna yükleyip Render üzerinde **Static Site** olarak yayına almanı ve ardından iPhone'a kurmanı adım adım anlatır. Backend olmadığı için build adımı, ortam değişkeni veya veritabanı gerekmez — tek yapman gereken, göndermeden önce kendi YouTube API anahtarını koda eklemek.

---

## 1. Zip dosyasını aç

İndirdiğin `manify-pwa.zip` dosyasını bir klasöre çıkar. İçinde şunlar olmalı:

```
manify-pwa/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── render.yaml
├── .gitignore
├── README.md
├── DEPLOY-REHBERI.md
├── icons/
│   ├── icon-192.png / .svg
│   ├── icon-512.png / .svg
│   └── apple-touch-icon.png / .svg
└── tests/
    └── manual-test-checklist.md
```

## 2. YouTube API anahtarını `app.js`'ye ekle

Bu adımı GitHub'a göndermeden **önce** yap.

1. Henüz almadıysan, [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com) üzerinde bir proje aç ve **YouTube Data API v3**'ü etkinleştir.
2. **APIs & Services → Credentials → Create Credentials → API key** ile bir anahtar oluştur.
3. Oluşan anahtara tıkla, **Application restrictions → Websites** seçip yalnızca sitenin adresini ekle (Render adresini 4. adımda alacaksın; şimdilik `*.onrender.com/*` yazıp deploy sonrası kesinleştirebilirsin).
4. `app.js` dosyasını bir metin editörüyle aç, en üstteki arama bölümünde şu satırı bul:

   ```js
   var YOUTUBE_API_KEY = "YOUR_YOUTUBE_DATA_API_V3_KEY_HERE";
   ```

5. Tırnak içindeki değeri kendi anahtarınla değiştir ve dosyayı kaydet.

> Bu anahtar sayfa kaynağında herkese görünür olacak (istemci taraflı bir uygulama olduğu için kaçınılmaz). 3. adımdaki site kısıtlaması, anahtarın başka yerlerde kullanılmasını engeller.

## 3. GitHub'a yükle

### Seçenek A — Terminalden (Git kuruluysa)

```bash
cd manify-pwa
git init
git add .
git commit -m "Manify PWA — ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/manify-pwa.git
git push -u origin main
```

> `KULLANICI_ADIN/manify-pwa` kısmını GitHub'da oluşturduğun (boş, README'siz) reponun adresiyle değiştir. Repo yoksa önce [github.com/new](https://github.com/new) adresinden oluştur.
>
> **Önemli:** Reponuzu **Private** yapmanız önerilir — `app.js` içinde gerçek API anahtarınız bulunuyor. Public bir repoda anahtar, GitHub'ın kod tarama botları tarafından bulunup otomatik olarak devre dışı bırakılabilir.

### Seçenek B — Tarayıcıdan (Git kullanmadan)

1. [github.com/new](https://github.com/new) adresinden yeni bir repo oluştur (adı: `manify-pwa`, **Private** seç).
2. Repo sayfasında **"uploading an existing file"** bağlantısına tıkla.
3. `manify-pwa` klasörünün **içindeki tüm dosya ve klasörleri** (klasörün kendisini değil) sürükleyip bırak — `icons/` ve `tests/` alt klasörleri korunacak şekilde yükle. API anahtarını eklediğin `app.js` dosyasının güncel hâlini yüklediğinden emin ol.
4. Alt kısımdan **Commit changes**'e bas.

## 4. Render'da statik site olarak yayınla

1. [render.com](https://render.com) adresine git, hesabınla giriş yap (yoksa GitHub ile ücretsiz kaydolabilirsin).
2. Dashboard'da **New +** → **Static Site** seç.
3. GitHub hesabını bağla ve az önce oluşturduğun `manify-pwa` reposunu seç (private repo ise Render'a erişim izni vermen istenecek).
4. Ayarlar ekranında:
   - **Name:** `manify-pwa` (istediğin gibi değiştirebilirsin)
   - **Branch:** `main`
   - **Build Command:** *boş bırak*
   - **Publish directory:** `.` (kök dizin)
5. **Create Static Site**'a bas.

Repo içinde `render.yaml` dosyası olduğu için Render bu ayarları çoğunlukla otomatik algılar; yine de yukarıdaki alanları elle kontrol etmen önerilir.

Birkaç dakika içinde Render sana şuna benzer bir adres verecek:

```
https://manify-pwa.onrender.com
```

Bu adres HTTPS olduğu için Service Worker ve PWA kurulumu sorunsuz çalışır (PWA'lar `http://` üzerinden — `localhost` hariç — çalışmaz).

### Adresi API anahtarı kısıtlamasına ekle

Render sana kesin adresi verdikten sonra, Google Cloud Console'a dön → **Credentials** → oluşturduğun API key → **Website restrictions** listesine tam adresi ekle (ör. `manify-pwa.onrender.com/*`). Bunu yapmazsan anahtar geçici olarak kısıtlamasız kalır (yine çalışır, ama daha az güvenli).

### Her `git push`'ta otomatik yayın

Render, GitHub reposuna her `push` yaptığında siteyi otomatik olarak yeniden yayınlar (Auto-Deploy varsayılan olarak açıktır). Yani bir dosyayı güncelleyip `git push` yaptığında birkaç dakika içinde canlı sitede de güncellenir.

### Özel alan adı (opsiyonel)

Render Static Site ayarlarında **Custom Domains** bölümünden kendi alan adını (ör. `manify.senin-domainin.com`) ekleyip DNS sağlayıcında gösterilen CNAME kaydını oluşturabilirsin. Render, özel alan adları için de otomatik ücretsiz SSL sağlar. Özel alan adı kullanıyorsan API key kısıtlamasına da bu adresi ekle.

## 5. Yayındaki siteyi kontrol et

Render adresini masaüstü tarayıcıda açıp:

- Sayfanın sorunsuz yüklendiğini,
- Arama kutusuna yazınca gerçek sonuçlar geldiğini (API anahtarı doğruysa),
- Tarayıcı sekmesinde "Application" (Chrome DevTools) → **Manifest** ve **Service Workers** bölümlerinde hata olmadığını

kontrol et. Sorun yaşarsan `tests/manual-test-checklist.md` listesini kullanarak sistematik test yap.

## 6. iPhone'a kurma (Ana Ekrana Ekle)

1. iPhone'da **Safari**'yi aç (Chrome/Firefox değil — "Ana Ekrana Ekle" yalnızca Safari'de PWA olarak çalışır).
2. Render'ın verdiği adresi (`https://manify-pwa.onrender.com`) aç.
3. Alt menüdeki **Paylaş** simgesine (kare + yukarı ok) dokun.
4. Aşağı kaydır, **"Ana Ekrana Ekle"**'yi seç.
5. Sağ üstten **Ekle**'ye dokun.
6. Manify artık ana ekranda bağımsız bir uygulama simgesi olarak görünür; açtığında adres çubuğu olmadan tam ekran (`standalone`) modda çalışır.

## 7. Güncelleme akışı

Bir değişiklik yaptığında:

```bash
git add .
git commit -m "Açıklama: ne değişti"
git push
```

Render otomatik olarak yeni sürümü yayınlar. iPhone'daki kurulu PWA, kullanıcı uygulamayı bir sonraki açışında (ve internete bağlıyken) Service Worker sayesinde güncel dosyaları indirir.

## 8. Sık karşılaşılan sorunlar

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Sayfa Render'da 404 veriyor | Publish directory yanlış | Ayarlardan **Publish directory**'nin `.` olduğunu doğrula |
| "Ana Ekrana Ekle" seçeneği çıkmıyor | HTTP üzerinden açılmış veya Safari değil | Adresin `https://` ile başladığından ve Safari kullandığından emin ol |
| İkon görünmüyor | `manifest.webmanifest` içindeki yol hatalı | `icons/` klasörünün repoda eksiksiz yüklendiğini kontrol et |
| Arama "API anahtarı tanımlı değil" diyor | `app.js` içindeki `YOUTUBE_API_KEY` hâlâ placeholder | 2. adımı tekrar kontrol et, gerçek anahtarı yapıştırıp yeniden `git push` yap |
| Arama "API anahtarı geçersiz" diyor | Yanlış kopyalanmış anahtar veya proje üzerinde API kapalı | Google Cloud Console'da anahtarı ve "YouTube Data API v3" etkin mi diye kontrol et |
| Arama "İstek reddedildi" diyor | API key'in Website restrictions listesi bu adresi kapsamıyor | Credentials → key → Website restrictions'a Render adresini ekle |
| Arama "günlük kota doldu" diyor | Ücretsiz günlük kota (~100 arama) tükendi | Ertesi gün otomatik sıfırlanır; sık kullanım için Google Cloud'da kota artışı talep edebilirsin |
| Eski sürüm hâlâ görünüyor | Service Worker eski dosyaları önbellekte tutuyor | Safari'de sayfayı kapatıp yeniden aç; gerekirse Ayarlar → Safari → Geçmişi ve Web Sitesi Verilerini Temizle |
