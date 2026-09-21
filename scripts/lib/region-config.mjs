// Input data for scripts/build-region-boundaries.mjs: the region tree as
// hand-edited config, one entry per node.
//
// Named REGION_CONFIG rather than REGIONS to stay distinct from the GENERATED
// REGIONS tree at src/data/regions/index.js, which every other script imports
// -- the two used to share a name across different modules, which reads as
// the same object until you check which file you are in.
//
//   level     'country' | 'province' | 'district'
//   query     Nominatim free-text lookup. Leaves only; a province is the union
//             of its children and the country has no polygon at all.
//   center    Optional override. The computed centre of mass of an irregular
//             outline can land somewhere no one associates with the place, so
//             the five original entry points keep their hand-picked centres.
//   nameVi    The accented Vietnamese name, shown to players. Provinces state
//             it; a leaf's is derived from its query (see vietnameseName) and
//             only needs stating where the derivation would mislead.
//
// To add a province: add its node and its leaves here, run this script, then
// scripts/build-pano-index.mjs and scripts/assign-pano-districts.mjs. No
// application code changes -- every screen reads the generated tree. The
// Coverage section of docs/project-overview.md explains what each kind of
// absent coverage means and which one is actually a defect.
export const REGION_CONFIG = {
  VN: { name: 'Vietnam', level: 'country' },

  // -- Ha Noi ---------------------------------------------------------------
  // Not merged in 2025, but split here into its 30 pre-2025 units.
  HN: { name: 'Ha Noi', nameVi: 'Hà Nội', level: 'province', parent: 'VN', center: [21.0285, 105.8542], legacyBbox: [105.28896, 20.56452, 106.02004, 21.38542] },
  'HN-BADINH': { name: 'Ba Dinh', level: 'district', parent: 'HN', query: 'Quận Ba Đình, Hà Nội, Việt Nam' },
  'HN-HOANKIEM': { name: 'Hoan Kiem', level: 'district', parent: 'HN', query: 'Quận Hoàn Kiếm, Hà Nội, Việt Nam' },
  'HN-TAYHO': { name: 'Tay Ho', level: 'district', parent: 'HN', query: 'Quận Tây Hồ, Hà Nội, Việt Nam' },
  'HN-LONGBIEN': { name: 'Long Bien', level: 'district', parent: 'HN', query: 'Quận Long Biên, Hà Nội, Việt Nam' },
  'HN-CAUGIAY': { name: 'Cau Giay', level: 'district', parent: 'HN', query: 'Quận Cầu Giấy, Hà Nội, Việt Nam' },
  'HN-DONGDA': { name: 'Dong Da', level: 'district', parent: 'HN', query: 'Quận Đống Đa, Hà Nội, Việt Nam' },
  'HN-HAIBATRUNG': { name: 'Hai Ba Trung', level: 'district', parent: 'HN', query: 'Quận Hai Bà Trưng, Hà Nội, Việt Nam' },
  'HN-HOANGMAI': { name: 'Hoang Mai', level: 'district', parent: 'HN', query: 'Quận Hoàng Mai, Hà Nội, Việt Nam' },
  'HN-THANHXUAN': { name: 'Thanh Xuan', level: 'district', parent: 'HN', query: 'Quận Thanh Xuân, Hà Nội, Việt Nam' },
  'HN-BACTULIEM': { name: 'Bac Tu Liem', level: 'district', parent: 'HN', query: 'Quận Bắc Từ Liêm, Hà Nội, Việt Nam' },
  'HN-NAMTULIEM': { name: 'Nam Tu Liem', level: 'district', parent: 'HN', query: 'Quận Nam Từ Liêm, Hà Nội, Việt Nam' },
  'HN-HADONG': { name: 'Ha Dong', level: 'district', parent: 'HN', query: 'Quận Hà Đông, Hà Nội, Việt Nam' },
  'HN-SONTAY': { name: 'Son Tay', level: 'district', parent: 'HN', query: 'Thị xã Sơn Tây, Hà Nội, Việt Nam' },
  'HN-BAVI': { name: 'Ba Vi', level: 'district', parent: 'HN', query: 'Huyện Ba Vì, Hà Nội, Việt Nam' },
  'HN-CHUONGMY': { name: 'Chuong My', level: 'district', parent: 'HN', query: 'Huyện Chương Mỹ, Hà Nội, Việt Nam' },
  'HN-DANPHUONG': { name: 'Dan Phuong', level: 'district', parent: 'HN', query: 'Huyện Đan Phượng, Hà Nội, Việt Nam' },
  'HN-DONGANH': { name: 'Dong Anh', level: 'district', parent: 'HN', query: 'Huyện Đông Anh, Hà Nội, Việt Nam' },
  'HN-GIALAM': { name: 'Gia Lam', level: 'district', parent: 'HN', query: 'Huyện Gia Lâm, Hà Nội, Việt Nam' },
  'HN-HOAIDUC': { name: 'Hoai Duc', level: 'district', parent: 'HN', query: 'Huyện Hoài Đức, Hà Nội, Việt Nam' },
  'HN-MELINH': { name: 'Me Linh', level: 'district', parent: 'HN', query: 'Huyện Mê Linh, Hà Nội, Việt Nam' },
  'HN-MYDUC': { name: 'My Duc', level: 'district', parent: 'HN', query: 'Huyện Mỹ Đức, Hà Nội, Việt Nam' },
  'HN-PHUXUYEN': { name: 'Phu Xuyen', level: 'district', parent: 'HN', query: 'Huyện Phú Xuyên, Hà Nội, Việt Nam' },
  'HN-PHUCTHO': { name: 'Phuc Tho', level: 'district', parent: 'HN', query: 'Huyện Phúc Thọ, Hà Nội, Việt Nam' },
  'HN-QUOCOAI': { name: 'Quoc Oai', level: 'district', parent: 'HN', query: 'Huyện Quốc Oai, Hà Nội, Việt Nam' },
  'HN-SOCSON': { name: 'Soc Son', level: 'district', parent: 'HN', query: 'Huyện Sóc Sơn, Hà Nội, Việt Nam' },
  'HN-THACHTHAT': { name: 'Thach That', level: 'district', parent: 'HN', query: 'Huyện Thạch Thất, Hà Nội, Việt Nam' },
  'HN-THANHOAI': { name: 'Thanh Oai', level: 'district', parent: 'HN', query: 'Huyện Thanh Oai, Hà Nội, Việt Nam' },
  'HN-THANHTRI': { name: 'Thanh Tri', level: 'district', parent: 'HN', query: 'Huyện Thanh Trì, Hà Nội, Việt Nam' },
  'HN-THUONGTIN': { name: 'Thuong Tin', level: 'district', parent: 'HN', query: 'Huyện Thường Tín, Hà Nội, Việt Nam' },
  'HN-UNGHOA': { name: 'Ung Hoa', level: 'district', parent: 'HN', query: 'Huyện Ứng Hòa, Hà Nội, Việt Nam' },

  // -- Ho Chi Minh ----------------------------------------------------------
  // Districts 2 and 9 are absent on purpose: both merged into Thu Duc in 2021.
  TPHCM: { name: 'Ho Chi Minh', nameVi: 'Hồ Chí Minh', level: 'province', parent: 'VN', center: [10.8231, 106.6297], legacyBbox: [106.46356, 10.35828, 107.02758, 10.92934] },
  'TPHCM-Q1': { name: 'District 1', level: 'district', parent: 'TPHCM', query: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q3': { name: 'District 3', level: 'district', parent: 'TPHCM', query: 'Quận 3, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q4': { name: 'District 4', level: 'district', parent: 'TPHCM', query: 'Quận 4, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q5': { name: 'District 5', level: 'district', parent: 'TPHCM', query: 'Quận 5, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q6': { name: 'District 6', level: 'district', parent: 'TPHCM', query: 'Quận 6, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q7': { name: 'District 7', level: 'district', parent: 'TPHCM', query: 'Quận 7, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q8': { name: 'District 8', level: 'district', parent: 'TPHCM', query: 'Quận 8, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q10': { name: 'District 10', level: 'district', parent: 'TPHCM', query: 'Quận 10, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q11': { name: 'District 11', level: 'district', parent: 'TPHCM', query: 'Quận 11, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q12': { name: 'District 12', level: 'district', parent: 'TPHCM', query: 'Quận 12, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-BINHTAN': { name: 'Binh Tan', level: 'district', parent: 'TPHCM', query: 'Quận Bình Tân, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-BINHTHANH': { name: 'Binh Thanh', level: 'district', parent: 'TPHCM', query: 'Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-GOVAP': { name: 'Go Vap', level: 'district', parent: 'TPHCM', query: 'Quận Gò Vấp, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-PHUNHUAN': { name: 'Phu Nhuan', level: 'district', parent: 'TPHCM', query: 'Quận Phú Nhuận, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-TANBINH': { name: 'Tan Binh', level: 'district', parent: 'TPHCM', query: 'Quận Tân Bình, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-TANPHU': { name: 'Tan Phu', level: 'district', parent: 'TPHCM', query: 'Quận Tân Phú, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-THUDUC': { name: 'Thu Duc', level: 'district', parent: 'TPHCM', query: 'Thành phố Thủ Đức, Việt Nam' },
  'TPHCM-BINHCHANH': { name: 'Binh Chanh', level: 'district', parent: 'TPHCM', query: 'Huyện Bình Chánh, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-CANGIO': { name: 'Can Gio', level: 'district', parent: 'TPHCM', query: 'Huyện Cần Giờ, Thành phố Hồ Chí Minh, Việt Nam' },
  // Cu Chi did not resolve for the pre-tree build either, which is why the old
  // tphcm.json carried "missingParts": 1 and no panorama in the index sits in
  // Cu Chi. Kept here so the gap stays visible rather than silently dropped.
  'TPHCM-CUCHI': { name: 'Cu Chi', level: 'district', parent: 'TPHCM', query: 'Huyện Củ Chi, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-HOCMON': { name: 'Hoc Mon', level: 'district', parent: 'TPHCM', query: 'Huyện Hóc Môn, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-NHABE': { name: 'Nha Be', level: 'district', parent: 'TPHCM', query: 'Huyện Nhà Bè, Thành phố Hồ Chí Minh, Việt Nam' },

  // -- Da Nang --------------------------------------------------------------
  // Hoang Sa is administratively part of Da Nang but is a disputed offshore
  // island group with no street imagery, so it is deliberately left out.
  DN: { name: 'Da Nang', nameVi: 'Đà Nẵng', level: 'province', parent: 'VN', center: [16.0544, 108.2022], legacyBbox: [107.81854, 15.91799, 108.33864, 16.2255] },
  'DN-HAICHAU': { name: 'Hai Chau', level: 'district', parent: 'DN', query: 'Quận Hải Châu, Đà Nẵng, Việt Nam' },
  'DN-THANHKHE': { name: 'Thanh Khe', level: 'district', parent: 'DN', query: 'Quận Thanh Khê, Đà Nẵng, Việt Nam' },
  'DN-SONTRA': { name: 'Son Tra', level: 'district', parent: 'DN', query: 'Quận Sơn Trà, Đà Nẵng, Việt Nam' },
  'DN-NGUHANHSON': { name: 'Ngu Hanh Son', level: 'district', parent: 'DN', query: 'Quận Ngũ Hành Sơn, Đà Nẵng, Việt Nam' },
  'DN-LIENCHIEU': { name: 'Lien Chieu', level: 'district', parent: 'DN', query: 'Quận Liên Chiểu, Đà Nẵng, Việt Nam' },
  'DN-CAMLE': { name: 'Cam Le', level: 'district', parent: 'DN', query: 'Quận Cẩm Lệ, Đà Nẵng, Việt Nam' },
  'DN-HOAVANG': { name: 'Hoa Vang', level: 'district', parent: 'DN', query: 'Huyện Hòa Vang, Đà Nẵng, Việt Nam' },

  // -- Lam Dong / Long An ---------------------------------------------------
  // DL and DH keep bare codes because their leaderboard keys already exist
  // under those names. Every leaf added since is prefixed with its province.
  LD: { name: 'Lam Dong', nameVi: 'Lâm Đồng', level: 'province', parent: 'VN', partialCoverage: 'one town covered', legacyBbox: [108.31521, 11.80798, 108.5944, 12.00855] },
  DL: { name: 'Da Lat', level: 'district', parent: 'LD', query: 'Thành phố Đà Lạt, Việt Nam', center: [11.9404, 108.4583] },

  // Long An covers three of its districts now, so legacyBbox is the whole
  // pre-2025 province rather than the extent of Duc Hoa alone -- a leaf
  // lookup is rejected when its centre falls outside the parent box, and
  // Ben Luc and Can Giuoc both sit well south of Duc Hoa.
  LA: { name: 'Long An', nameVi: 'Long An', level: 'province', parent: 'VN', partialCoverage: 'three districts covered', legacyBbox: [105.45, 10.35, 106.85, 11.1] },
  DH: { name: 'Duc Hoa', level: 'district', parent: 'LA', query: 'Đức Hòa, Việt Nam', center: [10.8888, 106.3825] },
  'LA-BENLUC': { name: 'Ben Luc', level: 'district', parent: 'LA', query: 'Bến Lức, Việt Nam' },
  'LA-CANGIUOC': { name: 'Can Giuoc', level: 'district', parent: 'LA', query: 'Cần Giuộc, Việt Nam' },

  // -- Dong Nai -------------------------------------------------------------
  // Code DNA, not DN: Da Nang holds that one. Long Khanh is left out -- its
  // panoramas fall in only two 1.1km cells, one short of playable.
  DNA: { name: 'Dong Nai', nameVi: 'Đồng Nai', level: 'province', parent: 'VN', partialCoverage: 'six districts covered', legacyBbox: [106.6, 10.45, 107.85, 11.6] },
  'DNA-BIENHOA': { name: 'Bien Hoa', level: 'district', parent: 'DNA', query: 'Thành phố Biên Hòa, Đồng Nai, Việt Nam' },
  'DNA-NHONTRACH': { name: 'Nhon Trach', level: 'district', parent: 'DNA', query: 'Nhơn Trạch, Đồng Nai, Việt Nam' },
  'DNA-LONGTHANH': { name: 'Long Thanh', level: 'district', parent: 'DNA', query: 'Long Thành, Đồng Nai, Việt Nam' },
  'DNA-TRANGBOM': { name: 'Trang Bom', level: 'district', parent: 'DNA', query: 'Trảng Bom, Đồng Nai, Việt Nam' },
  'DNA-VINHCUU': { name: 'Vinh Cuu', level: 'district', parent: 'DNA', query: 'Vĩnh Cửu, Đồng Nai, Việt Nam' },
  'DNA-THONGNHAT': { name: 'Thong Nhat', level: 'district', parent: 'DNA', query: 'Thống Nhất, Đồng Nai, Việt Nam' },

  // -- Binh Duong -----------------------------------------------------------
  // Ben Cat is deliberately absent despite having coverage: its imagery was
  // captured in 2016, and a decade-old streetscape makes a worse round than
  // no round at all.
  BD: { name: 'Binh Duong', nameVi: 'Bình Dương', level: 'province', parent: 'VN', partialCoverage: 'three cities covered', legacyBbox: [106.35, 10.85, 107.2, 11.85] },
  'BD-DIAN': { name: 'Di An', level: 'district', parent: 'BD', query: 'Dĩ An, Việt Nam' },
  'BD-THUANAN': { name: 'Thuan An', level: 'district', parent: 'BD', query: 'Thuận An, Việt Nam' },
  'BD-THUDAUMOT': { name: 'Thu Dau Mot', level: 'district', parent: 'BD', query: 'Thủ Dầu Một, Việt Nam' },

  // -- Thanh Hoa / Quang Nam ------------------------------------------------
  // Two provinces carried by a couple of towns each, the same shape as Lam
  // Dong. Both are here for variety: everything else added alongside them is
  // the industrial ring around Ho Chi Minh City, which all looks alike.
  TH: { name: 'Thanh Hoa', nameVi: 'Thanh Hóa', level: 'province', parent: 'VN', partialCoverage: 'two towns covered', legacyBbox: [104.35, 19.3, 106.1, 20.65] },
  'TH-THANHHOA': { name: 'Thanh Hoa City', nameVi: 'TP. Thanh Hóa', level: 'district', parent: 'TH', query: 'Thành phố Thanh Hóa, Thanh Hóa, Việt Nam' },
  'TH-SAMSON': { name: 'Sam Son', level: 'district', parent: 'TH', query: 'Sầm Sơn, Thanh Hóa, Việt Nam' },

  QNA: { name: 'Quang Nam', nameVi: 'Quảng Nam', level: 'province', parent: 'VN', partialCoverage: 'one town covered', legacyBbox: [107.1, 14.9, 108.75, 16.2] },
  'QNA-HOIAN': { name: 'Hoi An', level: 'district', parent: 'QNA', query: 'Hội An, Việt Nam' },
};
