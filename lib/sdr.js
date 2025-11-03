import { AltitudeUnit } from "../types.js";

const LONG_MSG_BITS = 112;
const SHORT_MSG_BITS = 56;

function msgLen(type) {
  return type & 0x10 ? LONG_MSG_BITS : SHORT_MSG_BITS;
}

const LONG_MSG_BYTES = LONG_MSG_BITS / 8;
const ICAO_CACHE_LEN = 1024;
const ICAO_CACHE_TTL = 60; // seconds
const AIS_CHARSET = "?ABCDEFGHIJKLMNOPQRSTUVWXYZ????? ???????????????0123456789??????";


const CHECKSUM_TABLE = new Uint32Array([
  0x3935ea, 0x1c9af5, 0xf1b77e, 0x78dbbf, 0xc397db, 0x9e31e9, 0xb0e2f0,
  0x587178, 0x2c38bc, 0x161c5e, 0x0b0e2f, 0xfa7d13, 0x82c48d, 0xbe9842,
  0x5f4c21, 0xd05c14, 0x682e0a, 0x341705, 0xe5f186, 0x72f8c3, 0xc68665,
  0x9cb936, 0x4e5c9b, 0xd8d449, 0x939020, 0x49c810, 0x24e408, 0x127204,
  0x093902, 0x049c81, 0xfdb444, 0x7eda22, 0x3f6d11, 0xe04c8c, 0x702646,
  0x381323, 0xe3f395, 0x8e03ce, 0x4701e7, 0xdc7af7, 0x91c77f, 0xb719bb,
  0xa476d9, 0xadc168, 0x56e0b4, 0x2b705a, 0x15b82d, 0xf52612, 0x7a9309,
  0xc2b380, 0x6159c0, 0x30ace0, 0x185670, 0x0c2b38, 0x06159c, 0x030ace,
  0x018567, 0xff38b7, 0x80665f, 0xbfc92b, 0xa01e91, 0xaff54c, 0x57faa6,
  0x2bfd53, 0xea04ad, 0x8af852, 0x457c29, 0xdd4410, 0x6ea208, 0x375104,
  0x1ba882, 0x0dd441, 0xf91024, 0x7c8812, 0x3e4409, 0xe0d800, 0x706c00,
  0x383600, 0x1c1b00, 0x0e0d80, 0x0706c0, 0x038360, 0x01c1b0, 0x00e0d8,
  0x00706c, 0x003836, 0x001c1b, 0xfff409, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

class Message {
    msg = null;
    msgbits = 0;
    msgtype = 0;
    crcOk = false;
    crc = 0;
    errorbit = -1;
    icao = 0;
    phaseCorrected = false;
    ca = null;
    metype = null;
    mesub = null;
    headingIsValid = null;
    heading = null;
    aircraftType = null;
    fflag = null;
    tflag = null;
    rawLatitude = null;
    rawLongitude = null;
    callsign = "";
    ewDir = null;
    ewVelocity = null;
    nsDir = null;
    nsVelocity = null;
    vertRateSource = null;
    vertRateSign = null;
    vertRate = null;
    speed = null;
    fs = null;
    dr = null;
    um = null;
    identity = null;
    altitude = null;
    unit = null;
}


export class Decoder {
  _fixErrors;
  _aggressive;
  _icaoCache;

  constructor(opts = {}) {
    this._fixErrors = opts.fixErrors !== false;
    this._aggressive = opts.aggressive || false;
    this._icaoCache = new Uint32Array(ICAO_CACHE_LEN * 2);
  }

  parse(msg, crcOnly = false) {
    const mm = new Message();
    mm.msg = msg;
    mm.msgtype = msg[0] >> 3;
    mm.msgbits = msgLen(mm.msgtype);

    mm.crc = msgcrc(msg, mm.msgbits);
    let crc = checksum(msg, mm.msgbits);
    mm.crcOk = mm.crc === crc;

    if (!mm.crcOk && this._fixErrors && (mm.msgtype === 11 || mm.msgtype === 17)) {
      mm.errorbit = fixSingleBitErrors(msg, mm.msgbits);
      if (mm.errorbit !== -1) {
        mm.crc = checksum(msg, mm.msgbits);
        mm.crcOk = true;
      } else if (this._aggressive && mm.msgtype === 17) {
        mm.errorbit = fixTwoBitsErrors(msg, mm.msgbits);
        if (mm.errorbit !== -1) {
          mm.crc = checksum(msg, mm.msgbits);
          mm.crcOk = true;
        }
      }
    }

    if (crcOnly) return mm;

    mm.ca = msg[0] & 7;
    mm.icao = (msg[1] << 16) | (msg[2] << 8) | msg[3];
    mm.metype = msg[4] >> 3;
    mm.mesub = msg[4] & 7;
    mm.fs = msg[0] & 7;
    mm.dr = (msg[1] >> 3) & 31;
    mm.um = ((msg[1] & 7) << 3) | (msg[2] >> 5);
    
    const a = ((msg[3] & 0x80) >> 5) | ((msg[2] & 0x02) >> 0) | ((msg[2] & 0x08) >> 3);
    const b = ((msg[3] & 0x02) << 1) | ((msg[3] & 0x08) >> 2) | ((msg[3] & 0x20) >> 5);
    const c = ((msg[2] & 0x01) << 2) | ((msg[2] & 0x04) >> 1) | ((msg[2] & 0x10) >> 4);
    const d = ((msg[3] & 0x01) << 2) | ((msg[3] & 0x04) >> 1) | ((msg[3] & 0x10) >> 4);
    mm.identity = a * 1000 + b * 100 + c * 10 + d;
    
    if (mm.msgtype !== 11 && mm.msgtype !== 17) {
      if (this._bruteForceAp(msg, mm)) {
        mm.crcOk = true;
      }
    } else {
      if (mm.crcOk && mm.errorbit === -1) {
        this._addRecentlySeenIcaoAddr(mm.icao);
      }
    }

    if (mm.msgtype === 0 || mm.msgtype === 4 || mm.msgtype === 16 || mm.msgtype === 20) {
      const r = decodeAc13Field(msg);
      if (r) {
        [mm.altitude, mm.unit] = r;
      }
    }
    
    if (mm.msgtype === 17) {
      if (mm.metype >= 1 && mm.metype <= 4) {
        mm.aircraftType = mm.metype - 1;
        mm.callsign = (
          AIS_CHARSET[msg[5] >> 2] +
          AIS_CHARSET[((msg[5] & 3) << 4) | (msg[6] >> 4)] +
          AIS_CHARSET[((msg[6] & 15) << 2) | (msg[7] >> 6)] +
          AIS_CHARSET[msg[7] & 63] +
          AIS_CHARSET[msg[8] >> 2] +
          AIS_CHARSET[((msg[8] & 3) << 4) | (msg[9] >> 4)] +
          AIS_CHARSET[((msg[9] & 15) << 2) | (msg[10] >> 6)] +
          AIS_CHARSET[msg[10] & 63]
        ).trim();
      } else if (mm.metype >= 9 && mm.metype <= 18) {
        mm.fflag = msg[6] & (1 << 2);
        mm.tflag = msg[6] & (1 << 3);
        const r = decodeAc12Field(msg);
        if (r) {
            [mm.altitude, mm.unit] = r;
        }
        mm.rawLatitude = ((msg[6] & 3) << 15) | (msg[7] << 7) | (msg[8] >> 1);
        mm.rawLongitude = ((msg[8] & 1) << 16) | (msg[9] << 8) | msg[10];
      } else if (mm.metype === 19 && mm.mesub && mm.mesub >= 1 && mm.mesub <= 4) {
        if (mm.mesub === 1 || mm.mesub === 2) {
          mm.ewDir = (msg[5] & 4) >> 2;
          mm.ewVelocity = ((msg[5] & 3) << 8) | msg[6];
          mm.nsDir = (msg[7] & 0x80) >> 7;
          mm.nsVelocity = ((msg[7] & 0x7f) << 3) | ((msg[8] & 0xe0) >> 5);
          mm.vertRateSource = (msg[8] & 0x10) >> 4;
          mm.vertRateSign = (msg[8] & 0x8) >> 3;
          mm.vertRate = ((msg[8] & 7) << 6) | ((msg[9] & 0xfc) >> 2);
          if (mm.nsVelocity && mm.ewVelocity) {
            mm.speed = Math.sqrt(mm.nsVelocity * mm.nsVelocity + mm.ewVelocity * mm.ewVelocity);
            if (mm.speed) {
              let ewv = mm.ewVelocity;
              let nsv = mm.nsVelocity;
              if (mm.ewDir) ewv *= -1;
              if (mm.nsDir) nsv *= -1;
              let heading = Math.atan2(ewv, nsv);
              mm.heading = (heading * 360) / (Math.PI * 2);
              if (mm.heading < 0) mm.heading += 360;
            } else {
              mm.heading = 0;
            }
          }
        } else if (mm.mesub === 3 || mm.mesub === 4) {
          mm.headingIsValid = (msg[5] & (1 << 2)) !== 0;
          mm.heading = (360 / 128) * (((msg[5] & 3) << 5) | (msg[6] >> 3));
        }
      }
    }

    return mm;
  }
  
  _bruteForceAp(msg, mm) {
    const relevantTypes = [0, 4, 5, 16, 20, 21, 24];
    if (relevantTypes.includes(mm.msgtype)) {
      const aux = new Uint8Array(LONG_MSG_BYTES);
      const lastbyte = mm.msgbits / 8 - 1;
      aux.set(msg.subarray(0, mm.msgbits / 8));
      
      const crc = checksum(aux, mm.msgbits);
      aux[lastbyte] ^= crc & 0xff;
      aux[lastbyte - 1] ^= (crc >> 8) & 0xff;
      aux[lastbyte - 2] ^= (crc >> 16) & 0xff;
      
      const addr = aux[lastbyte] | (aux[lastbyte - 1] << 8) | (aux[lastbyte - 2] << 16);
      if (this._icaoAddrWasRecentlySeen(addr)) {
        mm.icao = addr;
        return true;
      }
    }
    return false;
  }

  _icaoAddrWasRecentlySeen(addr) {
    const h = icaoCacheHashAddr(addr);
    const a = this._icaoCache[h * 2];
    const t = this._icaoCache[h * 2 + 1];
    const time = (Date.now() / 1000) >> 0;
    return !!(a && a === addr && time - t <= ICAO_CACHE_TTL);
  }

  _addRecentlySeenIcaoAddr(addr) {
    const h = icaoCacheHashAddr(addr);
    this._icaoCache[h * 2] = addr;
    this._icaoCache[h * 2 + 1] = (Date.now() / 1000) >> 0;
  }
}

function msgcrc(msg, msgbits) {
  const len = msgbits / 8;
  return (msg[len - 3] << 16) | (msg[len - 2] << 8) | msg[len - 1];
}

function decodeAc12Field(msg) {
  const qBit = msg[5] & 1;
  if (qBit) {
    const n = ((msg[5] >> 1) << 4) | ((msg[6] & 0xf0) >> 4);
    return [n * 25 - 1000, AltitudeUnit.FEET];
  }
}

function decodeAc13Field(msg) {
  const mBit = msg[3] & (1 << 6);
  const qBit = msg[3] & (1 << 4);
  let unit;

  if (!mBit) {
    unit = AltitudeUnit.FEET;
    if (qBit) {
      const n = ((msg[2] & 31) << 6) | ((msg[3] & 0x80) >> 2) | ((msg[3] & 0x20) >> 1) | (msg[3] & 15);
      return [n * 25 - 1000, unit];
    }
  } else {
    unit = AltitudeUnit.METERS;
  }
  return [0, unit];
}

function icaoCacheHashAddr(a) {
  a = ((((a >>> 16) ^ a) * 0x45d9f3b) & 0xffffffff) >>> 0;
  a = ((((a >>> 16) ^ a) * 0x45d9f3b) & 0xffffffff) >>> 0;
  a = (((a >>> 16) ^ a) & 0xffffffff) >>> 0;
  return a & (ICAO_CACHE_LEN - 1);
}

function fixTwoBitsErrors(msg, bits) {
  const aux = new Uint8Array(LONG_MSG_BYTES);
  const len = bits / 8;
  for (let j = 0; j < bits; j++) {
    const byte1 = (j / 8) >> 0;
    const bitmask1 = 1 << (7 - (j % 8));
    for (let i = j + 1; i < bits; i++) {
      const byte2 = (i / 8) >> 0;
      const bitmask2 = 1 << (7 - (i % 8));
      
      aux.set(msg.subarray(0, len));
      aux[byte1] ^= bitmask1;
      aux[byte2] ^= bitmask2;

      const crc1 = (aux[len - 3] << 16) | (aux[len - 2] << 8) | aux[len - 1];
      const crc2 = checksum(aux, bits);

      if (crc1 === crc2) {
        msg.set(aux.subarray(0, len));
        return j | (i << 8);
      }
    }
  }
  return -1;
}

function fixSingleBitErrors(msg, bits) {
  const aux = new Uint8Array(LONG_MSG_BYTES);
  const len = bits / 8;
  for (let j = 0; j < bits; j++) {
    const byte = (j / 8) >> 0;
    const bitmask = 1 << (7 - (j % 8));

    aux.set(msg.subarray(0, len));
    aux[byte] ^= bitmask;
    
    const crc1 = (aux[len - 3] << 16) | (aux[len - 2] << 8) | aux[len - 1];
    const crc2 = checksum(aux, bits);
    
    if (crc1 === crc2) {
      msg.set(aux.subarray(0, len));
      return j;
    }
  }
  return -1;
}

function checksum(msg, bits) {
  let crc = 0;
  const offset = bits === 112 ? 0 : 112 - 56;
  for (let j = 0; j < bits; j++) {
    const byte = (j / 8) >> 0;
    const bit = j % 8;
    const bitmask = 1 << (7 - bit);
    if (msg[byte] & bitmask) crc ^= CHECKSUM_TABLE[j + offset];
  }
  return crc;
}

const PREAMBLE_US = 8;
const FULL_LEN = PREAMBLE_US + LONG_MSG_BITS;

const MAG_LUT = new Uint16Array(129 * 129 * 2);
for (let i = 0; i <= 128; i++) {
  for (let q = 0; q <= 128; q++) {
    MAG_LUT[i * 129 + q] = Math.round(Math.sqrt(i * i + q * q) * 360);
  }
}

export class Demodulator {
  _aggressive;
  _checkCrc;
  _crcOnly;
  _mag;
  _decoder;
  
  constructor(opts = {}) {
    this._aggressive = opts.aggressive !== false;
    this._checkCrc = opts.checkCrc || true;
    this._crcOnly = opts.crcOnly || false;
    this._mag = opts.mag || null;
    this._decoder = new Decoder(opts);
  }

  process(data, size, onMsg) {
    if (!this._mag) this._mag = new Uint16Array(size / 2);
    this.computeMagnitudeVector(data, this._mag, size);
    this.detectMessage(this._mag, size / 2, onMsg);
  }

  computeMagnitudeVector(data, mag, size) {
    for (let j = 0; j < size; j += 2) {
      let i = data[j] - 127;
      let q = data[j + 1] - 127;
      if (i < 0) i = -i;
      if (q < 0) q = -q;
      mag[j / 2] = MAG_LUT[i * 129 + q];
    }
  }

  detectMessage(mag, maglen, onMsg) {
    const bits = new Uint8Array(LONG_MSG_BITS);
    const msg = new Uint8Array(LONG_MSG_BITS / 2);
    const aux = new Uint16Array(LONG_MSG_BITS * 2);
    let useCorrection = false;
    
    for (let j = 0; j < maglen - FULL_LEN * 2; j++) {
        if (useCorrection) {
            aux.set(mag.subarray(j + PREAMBLE_US * 2, j + PREAMBLE_US * 2 + aux.length));
            if (j && detectOutOfPhase(mag, j)) {
                applyPhaseCorrection(mag, j);
            }
        } else {
            if (
                !(
                    mag[j] > mag[j + 1] &&
                    mag[j + 1] < mag[j + 2] &&
                    mag[j + 2] > mag[j + 3] &&
                    mag[j + 3] < mag[j] &&
                    mag[j + 4] < mag[j] &&
                    mag[j + 5] < mag[j] &&
                    mag[j + 6] < mag[j] &&
                    mag[j + 7] > mag[j + 8] &&
                    mag[j + 8] < mag[j + 9] &&
                    mag[j + 9] > mag[j + 6]
                )
            ) {
                continue;
            }

            const high = (mag[j] + mag[j + 2] + mag[j + 7] + mag[j + 9]) / 6;
            if (mag[j + 4] >= high || mag[j + 5] >= high) {
                continue;
            }

            if (mag[j + 11] >= high || mag[j + 12] >= high || mag[j + 13] >= high || mag[j + 14] >= high) {
                continue;
            }
        }

        let errors = 0;
        for (let i = 0; i < LONG_MSG_BITS * 2; i += 2) {
            const low = mag[j + i + PREAMBLE_US * 2];
            const high = mag[j + i + PREAMBLE_US * 2 + 1];
            
            if (low > high) {
                bits[i / 2] = 1;
            } else if (high > low) {
                bits[i / 2] = 0;
            } else {
                bits[i / 2] = 2;
                if (i < SHORT_MSG_BITS * 2) errors++;
            }
        }
        
        if (useCorrection) {
            mag.set(aux, j + PREAMBLE_US * 2);
        }

        for (let i = 0; i < LONG_MSG_BITS; i += 8) {
            msg[i / 8] =
                (bits[i] << 7) | (bits[i + 1] << 6) | (bits[i + 2] << 5) | (bits[i + 3] << 4) |
                (bits[i + 4] << 3) | (bits[i + 5] << 2) | (bits[i + 6] << 1) | bits[i + 7];
        }

        const msgtype = msg[0] >> 3;
        const msglenBytes = msgLen(msgtype) / 8;

        let goodMessage = false;
        if (errors === 0 || (this._aggressive && errors < 3)) {
            const mm = this._decoder.parse(msg, this._crcOnly);
            if (mm.crcOk) {
                j += (PREAMBLE_US + msglenBytes * 8) * 2;
                goodMessage = true;
                if (useCorrection) mm.phaseCorrected = true;
            }

            if (mm.crcOk || !this._checkCrc) onMsg(mm);
        }

        if (!goodMessage && !useCorrection) {
            j--;
            useCorrection = true;
        } else {
            useCorrection = false;
        }
    }
  }
}

function detectOutOfPhase(mag, offset) {
    if (mag[offset + 3] > mag[offset + 2] / 3) return 1;
    if (mag[offset + 10] > mag[offset + 9] / 3) return 1;
    if (mag[offset + 6] > mag[offset + 7] / 3) return -1;
    if (mag[offset - 1] > mag[offset + 1] / 3) return -1;
    return 0;
}

function applyPhaseCorrection(mag, offset) {
    for (let j = 16; j < (LONG_MSG_BITS - 1) * 2; j += 2) {
        if (mag[offset + j] > mag[offset + j + 1]) {
            mag[offset + j + 2] = (mag[offset + j + 2] * 5) / 4;
        } else {
            mag[offset + j + 2] = (mag[offset + j + 2] * 4) / 5;
        }
    }
}
