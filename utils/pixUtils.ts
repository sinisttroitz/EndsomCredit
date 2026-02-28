export const generatePixPayload = (
  key: string,
  name: string,
  city: string,
  amount: number,
  transactionId: string = '***'
): string => {
  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const amountStr = amount.toFixed(2);
  
  const merchantAccountInfo = [
    formatField('00', 'BR.GOV.BCB.PIX'),
    formatField('01', key),
  ].join('');

  const payload = [
    formatField('00', '01'), // Payload Format Indicator
    formatField('26', merchantAccountInfo),
    formatField('52', '0000'), // Merchant Category Code
    formatField('53', '986'), // Transaction Currency (BRL)
    formatField('54', amountStr), // Transaction Amount
    formatField('58', 'BR'), // Country Code
    formatField('59', name), // Merchant Name
    formatField('60', city), // Merchant City
    formatField('62', formatField('05', transactionId)), // Additional Data Field Template
    '6304', // CRC16 placeholder
  ].join('');

  const crc16 = calculateCRC16(payload);
  return `${payload}${crc16}`;
};

const calculateCRC16 = (payload: string): string => {
  const polynomial = 0x1021;
  let crc = 0xFFFF;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
    }
  }

  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};
