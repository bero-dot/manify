# Manify Web PWA

Manify'ın Android/Metrolist fikrinden esinlenen, iPhone Safari ve iOS ana ekran kurulumuna odaklanan **kişisel** bir web uygulaması (PWA). Sunucu tarafında hiçbir özel backend/servis çalıştırmaz — statik dosyalardan oluşur ve doğrudan tarayıcıdan çalışır. Bu, tek kullanıcı (sen) için barındırılmak üzere tasarlanmıştır; bu yüzden YouTube API anahtarı bir ayarlar ekranından girilmek yerine doğrudan `app.js` içine gömülüdür.

## Projenin amacı

- YouTube üzerinden müzik/video arama ve keşif arayüzü sunmak.
- YouTube'un resmi **IFrame Player API**'si üzerinden oynatma yapmak.
- Favoriler, geçmiş, kuyruk ve ayarları yalnızca kullanıcının cihazında (IndexedDB / localStorage) saklamak.
- iPhone'da Safari üzerinden "Ana Ekrana Ekle" ile native benzeri bir deneyim sağlamak.

## Kurulumdan önce: YouTube API anahtarını ekle

Arama, resmi **YouTube Data API v3** üzerinden yapılır. Yayına almadan önce `app.js` dosyasını aç ve arama bölümünün başındaki şu satırı bul:

```js
var YOUTUBE_API_KEY = "YOUR_YOUTUBE_DATA_API_V3_KEY_HERE";
```

Bunu kendi anahtarınla değiştir:

1. [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com) üzerinde bir proje aç (veya var olanı kullan) ve **YouTube Data API v3**'ü etkinleştir.
2. **APIs & Services → Credentials → Create Credentials → API key** ile yeni bir anahtar oluştur.
3. **(Şiddetle önerilir)** Anahtara tıkla, **Application restrictions → Websites** seçip yalnızca kendi sitenin adresini ekle (ör. `manify-pwa.onrender.com/*`). Bu istemci taraflı bir uygulama olduğundan anahtar sayfa kaynağında herkese görünür olacaktır; site kısıtlaması olmadan başka biri anahtarı kopyalayıp senin günlük kotanı tüketebilir.
4. **API restrictions** altında yalnızca "YouTube Data API v3"ü seçili bırak.
5. Anahtarı kopyala, `app.js` içine yapıştır, dosyayı kaydet.

Ücretsiz kota günde ~100 arama ile sınırlıdır (arama başına 100 birim, günlük 10.000 birim ücretsiz kota — kota her gün otomatik sıfırlanır).

## Kurulum ve çalıştırma

Bu proje statik dosyalardan oluştuğu için herhangi bir build adımı yoktur. Herhangi bir statik dosya sunucusuyla servis edilebilir:

```bash
# Basit bir örnek (yalnızca yerel test için)
npx serve .
# veya
python3 -m http.server 8080
```

> **Not:** `file://` üzerinden doğrudan açmak Service Worker ve bazı tarayıcı API'lerini engelleyebilir; bir HTTP(S) sunucusu üzerinden servis edin.

### Render ile yayınlama (önerilen)

Detaylı adımlar için `DEPLOY-REHBERI.md` dosyasına bakın: GitHub'a yükleme, Render'da Static Site oluşturma ve iPhone'a kurma adım adım anlatılıyor.

### GitHub Pages ile yayınlama

1. Bu klasörü bir GitHub reposuna yükleyin.
2. Repo ayarlarında **Settings → Pages** bölümünden `main` dalını (veya `/docs` klasörünü) kaynak olarak seçin.
3. Yayınlanan `https://<kullanıcı>.github.io/<repo>/` adresini Safari'de açın.

### Netlify / Vercel ile statik yayınlama

- **Netlify:** Yeni site oluştururken "Deploy manually" ile bu klasörü sürükleyip bırakabilir, ya da repoyu bağlayıp *build command* alanını boş, *publish directory* alanını `.` (kök dizin) olarak ayarlayabilirsiniz.
- **Vercel:** Framework olarak "Other" seçip kök dizini olduğu gibi statik proje olarak dağıtabilirsiniz. Build adımı gerekmez.

## iPhone'da ana ekrana ekleme

1. Safari'de Manify sayfasını aç.
2. Alt menüde **Paylaş** simgesine dokun.
3. **"Ana Ekrana Ekle"** seçeneğini seç.
4. Sağ üstten **Ekle**'ye dokun.
5. Manify artık ana ekrandan bağımsız bir uygulama gibi açılır (adres çubuğu olmadan, `standalone` modda).

## Backend kullanılmadığı

Bu projede hiçbir özel backend, Node.js/PHP sunucusu, Firebase/Supabase fonksiyonu, proxy veya kullanıcının ayrıca çalıştırması gereken bir servis yoktur. Tüm istekler (arama ve oynatma dahil) doğrudan kullanıcının tarayıcısından atılır; Render/GitHub Pages/Netlify gibi servisler yalnızca statik dosyaları sunar.

## Arama: YouTube Data API v3

Arama, YouTube'un **resmi, belgelenmiş ve CORS destekleyen** `search.list` uç noktası üzerinden yapılır (`https://www.googleapis.com/youtube/v3/search`). Süre bilgisi için ikinci bir istekle (`videos.list`) video detayları da çekilir.

- Bu, önceki sürümlerde denenen resmi olmayan InnerTube yaklaşımının aksine **kararlı ve desteklenen** bir yöntemdir.
- Ücretsiz kota dolarsa (`quotaExceeded`), uygulama bunu anlaşılır bir mesajla bildirir ve sahte veri göstermez.
- API anahtarı geçersizse veya "API restrictions" nedeniyle bu site engellenmişse, ilgili hata mesajı gösterilir (bkz. `app.js` → `buildYouTubeApiError`).

## YouTube IFrame oynatma yöntemi

Oynatma, YouTube'un resmi **IFrame Player API**'si ile yapılır. Uygulama, ses akışını YouTube'dan bağımsız olarak indirmez veya çıkarmaz; video ID'sini YouTube'un kendi web oynatıcısına yükler ve bu oynatıcıyı kendi arayüzü içinden (oynat/duraklat/ileri/geri/ses/kuyruk) kontrol eder. Oynatıcı, tam ekran player içinde makul bir boyutta ve **görünür** biçimde yerleştirilmiştir — bağımsız bir ses motoruymuş gibi gizlenmez.

## iOS Safari kısıtlamaları

- iOS Safari, kullanıcı etkileşimi olmadan sesli otomatik oynatmaya izin vermeyebilir.
- Ekran kilitliyken veya uygulama arka plandayken oynatmanın sürmesi **garanti değildir**.
- Bazı tarayıcı API'leri (ör. IndexedDB) iOS'un özel/gizli gezinti modunda kısıtlı olabilir; bu durumda uygulama otomatik olarak `localStorage`'a düşer.

## Offline davranışı

Bir Service Worker (`sw.js`), yalnızca uygulama kabuğunu (HTML/CSS/JS/manifest/ikonlar) önbelleğe alır. Bu sayede internet olmadan da uygulama açılır. **YouTube API yanıtları veya IFrame player içeriği hiçbir zaman Service Worker tarafından önbelleğe alınmaz** — bunlar için her zaman aktif bir bağlantı gereklidir.

## Veri gizliliği

Favoriler, geçmiş, kuyruk, tema ve oynatma tercihleri yalnızca kullanıcının cihazında (öncelikle IndexedDB, kullanılamıyorsa `localStorage`) saklanır. Hiçbir kişisel veri herhangi bir sunucuya gönderilmez. "Ayarlar" sayfasından veriler JSON olarak dışa/içe aktarılabilir ve tek tuşla tamamen silinebilir.

Bu sürümde YouTube API anahtarı kaynak kodda gömülü olduğundan, siteyi ziyaret eden herkes tarayıcı geliştirici araçlarından anahtarı görebilir. Yukarıdaki "site kısıtlaması" adımını uygulamak, anahtarın yalnızca senin sitende çalışmasını sağlar ve kötüye kullanımı büyük ölçüde engeller.

## Bilinen sınırlamalar

- Arama, ücretsiz günlük kotaya tabidir (~100 arama/gün); kota dolarsa ertesi gün otomatik sıfırlanır.
- Bağımsız, YouTube'dan ayrı bir MP3/ses dosyası oynatma **desteklenmez** ve desteklenmeyecektir (YouTube Şartları ve telif hakları nedeniyle).
- Arka planda kesintisiz oynatma iOS Safari kısıtlamaları nedeniyle garanti edilemez.
- Bölgesel olarak kısıtlı, yaş sınırlı veya "başka sitelerde oynatma" izni olmayan videolar bu oynatıcıda da oynatılamaz (YouTube'un kendi kısıtlamasıdır).
- İkon dosyaları hem SVG hem de (ImageMagick/cairosvg ile üretilmiş) PNG olarak sağlanmıştır; kendi marka ikonlarınızla `icons/` klasöründeki `icon-192.png`, `icon-512.png` ve `apple-touch-icon.png` dosyalarını değiştirerek kolayca özelleştirebilirsiniz.

## Test etme

`tests/manual-test-checklist.md` dosyasındaki listeyi kullanarak manuel test yapın. Otomatik test altyapısı bu sürümde yoktur (backend'siz, tamamen statik bir proje olduğu için CI gerektirmez).

## Dosya yapısı

```
manify-pwa/
├── index.html                 # Uygulama kabuğu / tüm görünümler
├── styles.css                 # Manify siyah-pembe tasarımı, responsive
├── app.js                     # State, router, arama (Data API v3), player, depolama
├── manifest.webmanifest       # PWA manifesti
├── sw.js                      # Offline app-shell Service Worker
├── render.yaml                # Render Static Site yapılandırması
├── icons/
│   ├── icon-192.png / .svg
│   ├── icon-512.png / .svg
│   └── apple-touch-icon.png / .svg
├── README.md
├── DEPLOY-REHBERI.md          # GitHub + Render kurulum rehberi
└── tests/
    └── manual-test-checklist.md
```

## Gelecekte geliştirilebilecek özellikler

- Sürükle-bırak ile kuyruk sıralama (şu an yukarı/aşağı butonlarıyla yapılıyor).
- Playlist/albüm sayfalarının uygulama içinde (YouTube'a çıkmadan) listelenmesi.
- Çoklu dil desteği (şu an arayüz Türkçe).
- Kota tükendiğinde ikinci bir yedek API anahtarına otomatik geçiş.
