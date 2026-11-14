/**
 * Landing page content. Mirrors the game client (roster, modes, maps, bosses);
 * apps/game-client/public/tanitim/index.html shows the same content as a static page.
 */
export interface Operative {
  name: string;
  role: string;
  weapon: string;
  support: string;
  color: string;
}

export const OPERATIVES: Operative[] = [
  { name: 'Ironclad', role: 'Taarruz', weapon: 'Piyade tüfeği', support: 'F-16 hava saldırısı', color: '#6ea8ff' },
  { name: 'Valkyrie', role: 'Sıhhiye', weapon: 'Makineli tabanca (SMG)', support: 'İkmal paraşütü', color: '#5ad46a' },
  { name: 'Breaker', role: 'Kapı kıran', weapon: 'Pompalı tüfek', support: 'Dolmuş: şeritten geçer, önüne çıkanı ezer', color: '#f0a12b' },
  { name: 'Ghost', role: 'Keşif', weapon: 'Keskin nişancı tüfeği', support: 'SİHA hassas vuruş', color: '#b9a2ff' },
  { name: 'Tox', role: 'Simyacı', weapon: 'Sırt Pompası: zehir püskürtür', support: 'İlaçlama uçağı', color: '#9cff2e' },
  { name: 'Spark', role: 'Mühendis', weapon: 'Çivi Tabancası: hedefi delip geçer', support: 'Trafo: düşer, patlar, zincirleme çarpar', color: '#5cc8ff' },
  { name: 'Warden', role: 'Makineli', weapon: 'Hafif makineli tüfek', support: 'Taarruz helikopteri', color: '#e8b84a' },
  { name: 'Havoc', role: 'Yıkımcı', weapon: 'Boru Havan: alan patlaması', support: 'Topçu bataryası', color: '#e23b2f' },
];

export interface Mode {
  icon: string;
  name: string;
  desc: string;
  isNew?: boolean;
}

export const MODES: Mode[] = [
  { icon: '⏱', name: 'Hayatta Kal', desc: '20–60 dakika dayan. Her 5 dakikada bir boss, sonda son boss.' },
  { icon: '🧟', name: 'Horde', desc: '20 sürü dalgası. Biri bitmeden sonraki gelmez.' },
  { icon: '⛨', name: 'Savunma', desc: 'Jeneratörü süre dolana kadar koru.' },
  { icon: '✚', name: 'Kurtarma', desc: 'Üç hayatta kalanı bul, time kat, tahliye noktasını tut.' },
  { icon: '⛽', name: 'Tahliye', desc: 'Dört yakıt bidonu topla, helikopter gelene kadar dayan.' },
  { icon: '☠', name: 'Boss Avı', desc: 'Üç boss sırayla geliyor.' },
  { icon: '⚑', name: 'Bölge Kontrol', desc: 'Dört bölgeyi sırayla ele geçir. Halkadan çıkarsan ilerleme erir.', isNew: true },
  { icon: '🎯', name: 'İnfaz Listesi', desc: 'Altı işaretli hedefi tek tek avla. Sonuncusu boss.', isNew: true },
  { icon: '⚡', name: 'Katliam', desc: 'Yedi dakikada öldürme kotasını doldur. Boss öldürmek süre kazandırır.', isNew: true },
  { icon: '∞', name: 'Sonsuz', desc: 'Bitiş yok. Ne kadar dayanabilirsin?' },
];

export const MAPS: Array<{ id: string; name: string; mood: string }> = [
  { id: 'city', name: 'Ölü Şehir', mood: 'Gece · Yağmur' },
  { id: 'hospital', name: 'Karantina Hastanesi', mood: 'Sis · Hafif yağmur' },
  { id: 'military', name: 'Askeri Üs Kartal', mood: 'Gün batımı · Kül' },
  { id: 'harbor', name: 'Kuzey Limanı', mood: 'Gece · Yoğun sis' },
  { id: 'forest', name: 'Kara Orman', mood: 'Ay ışığı · Sis' },
  { id: 'highway', name: 'Otoyol 9', mood: 'Bulutlu · Toz' },
  { id: 'industrial', name: 'Sanayi Bölgesi', mood: 'Duman · Turuncu gök' },
  { id: 'snow', name: 'Kar Köyü', mood: 'Kar fırtınası' },
  { id: 'desert', name: 'Çöl Kasabası', mood: 'Yakıcı güneş · Kum' },
  { id: 'lab', name: 'Yeraltı Laboratuvarı', mood: 'Acil durum ışıkları' },
];

export const BOSSES: Array<{ name: string; desc: string; wave: number; color: string }> = [
  { name: 'Mutant', desc: 'Yeri döver, üstüne koşar. Diğerlerini tanımadan önce bununla tanışırsın.', wave: 1, color: '#b91c1c' },
  { name: 'Kasap', desc: 'Hızlı ve sert vurur ama canı az. Mesafeni koru.', wave: 3, color: '#ff7a1a' },
  { name: 'Kor', desc: 'Bastığı yeri yakar, ölünce geniş bir yangın bırakır.', wave: 5, color: '#ff4d00' },
  { name: 'Ana Kovan', desc: 'Yürürken sürüngen doğurur. Önce onu indir.', wave: 7, color: '#b8a000' },
  { name: 'Şalter', desc: 'Yerde mavi halka belirince çık: şok dalgası sersemletir.', wave: 9, color: '#5cc8ff' },
];

/** Where "Hemen oyna" goes. Set NEXT_PUBLIC_GAME_URL to the game's own address once it is live. */
export const GAME_URL = process.env.NEXT_PUBLIC_GAME_URL || '/arena';
export const DRACORD_URL = 'https://dracord.com.tr';
