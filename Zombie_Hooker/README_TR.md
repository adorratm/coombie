# Çengelci Zombi — Hooker Zombie

Blender 5.2.3 LTS ile Blender Python API kullanılarak üretilmiş, özgün stilize düşman varlığı. Oyun projesindeki mevcut dosyalara dokunulmadı.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `Zombie_Hooker.blend` | Düzenlenebilir kaynak, 24 kemikli rig, 8 action, materyaller, UV, sunum sahnesi ve gizli LOD referansı |
| `Zombie_Hooker.glb` | Animasyonlu ana model; toplam **13.671 üçgen**, 1 skin, 3 skinned mesh |
| `Zombie_Hooker_LOD1.glb` | Kalabalıklar için **5.979 üçgen**, aynı rig ve 8 animasyon |
| `HookTip.glb` | Bağımsız kanca mermisi; 366 üçgen, pivottan kanca köküne hizalı |
| `HookTether_Segment.glb` | 1 metre uzunluğunda organik bağ; 206 üçgen |
| `HookWarning.glb` | Kırmızı emissive zemin halkası ve yön işaretleri; 164 üçgen |
| `Animation_Preview.mp4` | Sekiz klibi sırayla gösteren, isimlendirilmiş hareket incelemesi; 960×720, 30 fps, 9,67 saniye |
| `renders/01_Front.png` | Önden ortografik render |
| `renders/02_Side.png` | Yandan ortografik render |
| `renders/03_Top.png` | Tam üstten ortografik render |
| `renders/04_Hero.png` | Üç çeyrek sunum renderı |
| `renders/05_Deadly_Hook.png` | Uzamış kanca, organik bağ ve kırmızı uyarı halkası |
| `export_validation.json` | Gerçek GLB geri aktarımı ve animasyon test sonuçları |
| `source_validation.json` | İlk kaynak üretimi sırasındaki geometri ve hareket ölçümleri |
| `video_validation.json` | MP4 kare çözümleme kontrolü |

PNG sunumları Cycles ile hazırlanmıştır. MP4, hareketleri hızlı ve net incelemek için Workbench ile render edilmiştir; son ışıklandırma ve bloom görünümünü temsil etmez. `renders/QA_*.png` MP4'ten çözülmüş kontrol kareleridir.

## Eksenler, ölçek ve materyaller

- Kaynak: metre, **Z yukarı, +Y ön**. Karakterin sağı **−X** yönündedir. Yaklaşık 2,9 m boyundaki iri yaratık tasarımı.
- GLB, glTF standardına göre **Y yukarı / −Z ön** olarak dönüştürülür. Blender'a geri aktarım Z-yukarı yönünü geri getirir. Motorun standart glTF içe aktarıcısını kullanın; ikinci bir eksen dönüşümü eklemeyin.
- PBR materyaller ve `COLOR_0` vertex renkleri GLB içinde taşınır. Harici doku veya prosedürel shader bağımlılığı yoktur. UV0, sonraki boyama/bake işlemleri için mevcuttur.
- Koyu kızıl deri, petrol yeşili kumaş, yaşlı kemik ve yeşil emissive gözler kullanılır. Ana gövdede 7 materyal bölgesi vardır. Daha büyük sürülerde LOD1, animasyon culling ve motorun materyal birleştirme seçeneklerini değerlendirin; oyun performansı bu çalışma kapsamında ölçülmedi.
- Işıma rengi GLB içinde taşınır. Ekranda hale görünümü için oyun motorunun bloom ayarını kullanın.

## Animasyon klipleri

Tüm klipler gerçek kemik dönüşümleriyle hazırlanmıştır; root motion ilerlemesi yoktur. Yürüyüşteki küçük yan salınım ve saldırı hamlesi görsel harekettir. Konum hareketini oyun motoru yönetmelidir.

| Action / klip | Kaynak kareler (30 fps) | Süre | Döngü |
|---|---|---|---|
| `Idle` | 1–61 | 2,00 s | Evet |
| `Walk` | 1–41 | 1,33 s | Evet |
| `AttackMelee` | 1–31 | 1,00 s | Hayır |
| `HookWindup` | 1–25 | 0,80 s | Hayır |
| `HookCast` | 1–22 | 0,70 s | Hayır |
| `HookRecover` | 1–28 | 0,90 s | Hayır |
| `Hit` | 1–19 | 0,60 s | Hayır |
| `Death` | 1–55 | 1,80 s | Hayır; son pozu tutun |

Blender'da `Hooker_Rig` seçiliyken Dope Sheet > Action Editor içinden klibi seçin ve tabloya göre zaman aralığını ayarlayın. Dosya `Idle` seçili açılır. Ayrı isimli NLA izleri, GLB kliplerinin birleştirilmeden aktarılmasını sağlar; kaynakta bu izler sessizdir, aktif action oynar. Gizli `04 • CROWD LOD` koleksiyonunu yalnızca LOD incelemesi için açın.

## Ölümcül Çengel entegrasyonu

Önerilen sıralama: `HookWindup` → `HookCast` → `HookRecover` → `Idle` veya `Walk`. İlk iki geçişin uç pozları birebir eşleşir. Yakın saldırı için ayrı `AttackMelee` klibini tetikleyin.

`HookSpawn`, sağ bileğe bağlı adlandırılmış nesnedir; aynı isimli socket kemiği de bulunur. Mermiyi bu nesnenin **dünya dönüşümünden** üretin. Bağımsız `HookTip.glb` dosyasının başlangıç noktası kancanın bileğe birleştiği köktür; kaynak yerel +Y atış eksenidir.

İki kullanım biçimi:

1. **Animasyon önizlemesi:** Modeldeki `HookTip` ve `HookTether_Animated` meshlerini bırakın. `hook.R` kemiği kancayı ileri taşır; `tether.R` bağı uzatır. Görsel atış yaklaşık 3,6 m'lik kemik yer değiştirmesi kullanır.
2. **Gerçek oyun mermisi:** Atış sırasında modelin `HookTip` ve `HookTether_Animated` meshlerini gizleyin. `HookSpawn` dönüşümünde bağımsız `HookTip.glb` üretin; hedef, çarpışma ve geri çekmeyi motor koduyla yönetin. Toparlanma tamamlanınca modeldeki kancayı geri gösterin. Böylece çift kanca görünmez.

Bağımsız `HookTether_Segment.glb`, kaynak yerel Y boyunca 0–1 m uzanır. Başlangıcını `HookSpawn` noktasına yerleştirin, uzun eksenini mermi köküne yöneltin ve uzunluk ölçeğini aradaki mesafe yapın. Standart Y-yukarı GLB içe aktarımında uzun eksen **−Z** olur. Çok uzun mesafelerde tek parçayı aşırı ölçeklemek yerine parçaları tekrar edin veya spline kullanın.

`HookWarning` kaynak XY düzlemindedir; merkezden yarıçapı yaklaşık 1 m'dir. Zeminin biraz üstüne koyun, yarıçapı ölçekleyin, hazırlıkta görünür yapın ve toparlanma sonunda gizleyin. Başlangıç rengi ve emissive güç hazırdır; nabız/şeffaflık hareketini motor materyalinde ekleyebilirsiniz.

| Olay adı | Klip / kaynak kare | Önerilen motor olayı |
|---|---|---|
| `MeleeHit` | `AttackMelee` / 17 | Yakın hasar kontrolü |
| `WarningOn` | `HookWindup` / 1 | Kırmızı uyarıyı göster |
| `SpawnProjectile` | `HookCast` / 6 | Mermiyi oluştur; yaklaşık 0,167 s |
| `MaxReach` | `HookCast` / 22 | Görsel uzama sonu |
| `Retract` | `HookRecover` / 1 | Geri çekmeyi başlat |
| `WarningOff` | `HookRecover` / 28 | Uyarıyı kapat |
| `DisableCollision` | `Death` / 21 | Motorun ölüm mantığına göre çarpışmayı kapat |

Bu işaretler Blender action marker'larıdır. **glTF standart animasyon olaylarını taşımadığından** motorun animation event/state sistemine bu tablodan eklenmelidir. Oyuncuyu yakalama, hasar, menzil ve kendine çekme mantığı bu görsel varlık paketinin parçası değildir.

## Doğrulama

- `.blend`, ayrı bir Blender sürecinde tekrar açıldı.
- Ana GLB tamamen boş bir Blender sahnesine yeniden aktarıldı; 24 kemik, 3 skinned mesh ve 8 ayrı klip bulundu.
- Tüm kliplerin her karesinde sonlu vertex konumları ve gerçek deformasyon kontrol edildi; ağırlıksız vertex bulunmadı.
- `Idle` ve `Walk` başlangıç/bitiş pozları eşleşti. `HookWindup` → `HookCast` ve `HookCast` → `HookRecover` geçişlerinde ölçülen vertex farkı sıfırdır.
- Zemine temas, geri aktarım sonrası örneklerde −6 mm toleransla test edildi; atış sırasında glTF yeniden örneklemesinden gelen en düşük nokta yaklaşık −3,2 mm'dir.
- Beş GLB'de gömülü veriler doğrulandı; bağımsız yetenek parçalarında gereksiz skeleton yoktur. LOD1'de sekiz animasyon bulunur.
- MP4 290 kare olarak yeniden çözüldü; başlangıç, atış ve ölüm kareleri görsel olarak kontrol edildi.
- Motor içi entegrasyon ve performans testi yapılmadı.

## Yeniden üretim

Bu klasördeki Python dosyaları yalnızca bu klasöre çıktı yazar. Tam üretim sırası:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\build_zombie.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background .\Zombie_Hooker.blend --python .\finish_and_preview.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background .\Zombie_Hooker.blend --python .\finish_and_preview.py -- --preview
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background .\Zombie_Hooker.blend --python .\render_extras.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\verify_exports.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\verify_video.py
```
