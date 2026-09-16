# Manify — Manuel Test Kontrol Listesi

Her sürümden önce aşağıdaki testleri elle çalıştırın. ✅ / ❌ ile işaretleyin ve bulguları not edin.

## 1. Açılış / platform uyumluluğu
- [ ] Masaüstü Chrome'da açılış
- [ ] Android Chrome'da açılış
- [ ] iPhone Safari'de açılış (tarayıcı sekmesinde)
- [ ] "Ana Ekrana Ekle" sonrası iOS standalone modda açılış (adres çubuğu olmamalı)
- [ ] Safe-area (çentik/ev tuşu şeridi) alanları içerik tarafından örtülmüyor

## 2. Gezinme
- [ ] Sidebar/menü açma
- [ ] Sidebar/menü kapatma (X, arka plan tıklama, görünüm değiştirme)
- [ ] Alt sekmeler arası geçiş: Ana Sayfa / Ara / Favoriler / Geçmiş / Kuyruk / Ayarlar
- [ ] Kuyruk yan paneli açma/kapatma

## 3. Arama
- [ ] Geçerli bir sorguyla arama yapma
- [ ] Enter tuşuyla arama
- [ ] Arama sırasında loading/skeleton görünümü
- [ ] Arama başarısız olduğunda (ağ hatası / geçersiz anahtar / kota dolu) anlamlı hata mesajı ve "Tekrar dene" butonu
- [ ] Filtre çiplerinin (Tümü/Şarkı/Video/Sanatçı/Albüm/Playlist) sonuçları doğru filtrelemesi
- [ ] Sonuç kartlarında thumbnail, başlık, sanatçı, süre görünüyor

## 4. Oynatma
- [ ] Sonuca dokunarak oynatma başlatma
- [ ] Duraklatma
- [ ] Devam ettirme
- [ ] Sonraki parçaya geçme
- [ ] Önceki parçaya geçme (3 sn kuralı: >3 sn ise başa sarar)
- [ ] İlerleme çubuğuyla seek yapma
- [ ] Ses/parça bittiğinde otomatik sonrakine geçme (ayar açıkken)
- [ ] Tekrar modları: Kapalı / Tek Parça / Tüm Kuyruk
- [ ] Karıştır aç/kapat

## 5. Kuyruk
- [ ] Kuyruğa ekleme
- [ ] Kuyruktan silme
- [ ] Kuyruğu temizleme
- [ ] Sırayı yukarı/aşağı butonlarıyla değiştirme
- [ ] Kuyruktaki bir öğeye dokununca o öğeden oynatma başlaması
- [ ] Şimdi çalan öğenin kuyrukta vurgulanması

## 6. Favoriler
- [ ] Favoriye ekleme
- [ ] Favoriden çıkarma
- [ ] Favorilerde arama/filtreleme
- [ ] Favorilerden doğrudan oynatma

## 7. Geçmiş
- [ ] Son çalınanların listelenmesi
- [ ] Son aramaların listelenmesi
- [ ] Geçmişi temizleme (Geçmiş sayfası ve Ayarlar sayfasından)
- [ ] Geçmiş kapalıyken yeni kayıt eklenmemesi

## 8. Ayarların saklanması
- [ ] Tema seçimi sayfa yenilendikten sonra korunuyor
- [ ] Otomatik sonraki / kuyruğu geri yükle / geçmiş ayarları korunuyor
- [ ] Verileri dışa aktarma (JSON indirme)
- [ ] Verileri içe aktarma (geçerli JSON dosyası)
- [ ] Geçersiz JSON dosyası içe aktarılmaya çalışıldığında uygulama çökmüyor, hata gösteriliyor

## 9. Offline / Service Worker
- [ ] İlk ziyarette Service Worker kuruluyor
- [ ] Uçak modunda/offline iken uygulama kabuğu (arayüz) açılabiliyor
- [ ] Offline banner'ı görünüyor
- [ ] Service Worker kurulumu başarısız olsa bile uygulama yine de çalışıyor

## 10. Hata senaryoları
- [ ] Geçersiz video ID ile oynatma denemesi güvenli şekilde reddediliyor
- [ ] YouTube IFrame API yüklenemediğinde anlamlı hata gösteriliyor, beyaz ekran oluşmuyor
- [ ] `YOUTUBE_API_KEY` placeholder bırakıldığında "API anahtarı tanımlı değil" mesajı çıkıyor, uygulama çökmüyor
- [ ] Geçersiz bir API anahtarıyla anlamlı "API anahtarı geçersiz" mesajı çıkıyor
- [ ] Günlük kota simülasyonu/aşımı durumunda "kota doldu" mesajı çıkıyor, uygulama çökmüyor
- [ ] IndexedDB kullanılamadığında (ör. gizli sekme) localStorage'a düşülüyor
- [ ] Bozuk/geçersiz JSON kaydı bulunduğunda otomatik temizlenip bilgi veriliyor

## 11. Erişilebilirlik
- [ ] Tüm etkileşimli öğeler klavye ile ulaşılabilir ve odak göstergesi görünür
- [ ] Butonlar gerçek `<button>` elemanı
- [ ] Görsellerde `alt` metni var
- [ ] `aria-live` alanları hata/bildirimleri duyuruyor
- [ ] "Animasyonları azalt" / `prefers-reduced-motion` etkinken gereksiz animasyon oynamıyor

## 12. Görsel / responsive
- [ ] Safe-area (üst/alt çentik) görünümü iPhone'da doğru
- [ ] Mini player içerik altında kalmıyor, klavye açıldığında bozulmuyor
- [ ] Küçük ekranlarda (SE boyutu) düzen kırılmıyor
- [ ] Büyük ekranlarda (tablet/masaüstü) içerik ortalanmış ve okunabilir kalıyor
