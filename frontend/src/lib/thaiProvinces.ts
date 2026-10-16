// Thailand's 77 provinces: [English name, Thai name]. The English name is what
// gets saved in the location text and sent to the weather lookup.
export const THAI_PROVINCES: [string, string][] = [
  ['Bangkok', 'กรุงเทพมหานคร'],
  ['Amnat Charoen', 'อำนาจเจริญ'],
  ['Ang Thong', 'อ่างทอง'],
  ['Bueng Kan', 'บึงกาฬ'],
  ['Buri Ram', 'บุรีรัมย์'],
  ['Chachoengsao', 'ฉะเชิงเทรา'],
  ['Chai Nat', 'ชัยนาท'],
  ['Chaiyaphum', 'ชัยภูมิ'],
  ['Chanthaburi', 'จันทบุรี'],
  ['Chiang Mai', 'เชียงใหม่'],
  ['Chiang Rai', 'เชียงราย'],
  ['Chon Buri', 'ชลบุรี'],
  ['Chumphon', 'ชุมพร'],
  ['Kalasin', 'กาฬสินธุ์'],
  ['Kamphaeng Phet', 'กำแพงเพชร'],
  ['Kanchanaburi', 'กาญจนบุรี'],
  ['Khon Kaen', 'ขอนแก่น'],
  ['Krabi', 'กระบี่'],
  ['Lampang', 'ลำปาง'],
  ['Lamphun', 'ลำพูน'],
  ['Loei', 'เลย'],
  ['Lop Buri', 'ลพบุรี'],
  ['Mae Hong Son', 'แม่ฮ่องสอน'],
  ['Maha Sarakham', 'มหาสารคาม'],
  ['Mukdahan', 'มุกดาหาร'],
  ['Nakhon Nayok', 'นครนายก'],
  ['Nakhon Pathom', 'นครปฐม'],
  ['Nakhon Phanom', 'นครพนม'],
  ['Nakhon Ratchasima', 'นครราชสีมา'],
  ['Nakhon Sawan', 'นครสวรรค์'],
  ['Nakhon Si Thammarat', 'นครศรีธรรมราช'],
  ['Nan', 'น่าน'],
  ['Narathiwat', 'นราธิวาส'],
  ['Nong Bua Lam Phu', 'หนองบัวลำภู'],
  ['Nong Khai', 'หนองคาย'],
  ['Nonthaburi', 'นนทบุรี'],
  ['Pathum Thani', 'ปทุมธานี'],
  ['Pattani', 'ปัตตานี'],
  ['Phang Nga', 'พังงา'],
  ['Phatthalung', 'พัทลุง'],
  ['Phayao', 'พะเยา'],
  ['Phetchabun', 'เพชรบูรณ์'],
  ['Phetchaburi', 'เพชรบุรี'],
  ['Phichit', 'พิจิตร'],
  ['Phitsanulok', 'พิษณุโลก'],
  ['Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา'],
  ['Phrae', 'แพร่'],
  ['Phuket', 'ภูเก็ต'],
  ['Prachin Buri', 'ปราจีนบุรี'],
  ['Prachuap Khiri Khan', 'ประจวบคีรีขันธ์'],
  ['Ranong', 'ระนอง'],
  ['Ratchaburi', 'ราชบุรี'],
  ['Rayong', 'ระยอง'],
  ['Roi Et', 'ร้อยเอ็ด'],
  ['Sa Kaeo', 'สระแก้ว'],
  ['Sakon Nakhon', 'สกลนคร'],
  ['Samut Prakan', 'สมุทรปราการ'],
  ['Samut Sakhon', 'สมุทรสาคร'],
  ['Samut Songkhram', 'สมุทรสงคราม'],
  ['Saraburi', 'สระบุรี'],
  ['Satun', 'สตูล'],
  ['Sing Buri', 'สิงห์บุรี'],
  ['Si Sa Ket', 'ศรีสะเกษ'],
  ['Songkhla', 'สงขลา'],
  ['Sukhothai', 'สุโขทัย'],
  ['Suphan Buri', 'สุพรรณบุรี'],
  ['Surat Thani', 'สุราษฎร์ธานี'],
  ['Surin', 'สุรินทร์'],
  ['Tak', 'ตาก'],
  ['Trang', 'ตรัง'],
  ['Trat', 'ตราด'],
  ['Ubon Ratchathani', 'อุบลราชธานี'],
  ['Udon Thani', 'อุดรธานี'],
  ['Uthai Thani', 'อุทัยธานี'],
  ['Uttaradit', 'อุตรดิตถ์'],
  ['Yala', 'ยะลา'],
  ['Yasothon', 'ยโสธร'],
];

export function provinceLabel(en: string, thai: boolean): string {
  const hit = THAI_PROVINCES.find(([name]) => name === en);
  return hit ? (thai ? hit[1] : hit[0]) : en;
}

// "Hang Dong, Chiang Mai, Thailand" from the two form fields. Without a
// province there is nothing useful to save, so it returns an empty string.
export function formatLocation(area: string, province: string): string {
  if (!province) return '';
  const parts = [area.trim(), province, 'Thailand'].filter(Boolean);
  return parts.join(', ');
}

// Splits a saved location back into the two fields. Older free-text values
// that do not match a province keep their text in the area field.
export function parseLocation(value: string): { area: string; province: string } {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length && parts[parts.length - 1].toLowerCase() === 'thailand') parts.pop();
  const last = parts[parts.length - 1]?.toLowerCase();
  const hit = THAI_PROVINCES.find(([name]) => name.toLowerCase() === last);
  if (hit) {
    parts.pop();
    return { area: parts.join(', '), province: hit[0] };
  }
  return { area: parts.join(', '), province: '' };
}
