/**
 * Sinh chuỗi VietQR (chuẩn EMVCo / NAPAS 247) để mọi app ngân hàng quét được.
 * Không phụ thuộc dịch vụ bên ngoài.
 */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildVietQrPayload(opts: { bankBin: string; accountNo: string; amount: number; addInfo: string }): string {
  const beneficiary = tlv('00', opts.bankBin) + tlv('01', opts.accountNo);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const additional = tlv('08', opts.addInfo.slice(0, 50));
  let payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('54', String(Math.round(opts.amount))) +
    tlv('58', 'VN') +
    tlv('62', additional) +
    '6304';
  payload += crc16(payload);
  return payload;
}
