const Byte = require ("./Byte").Byte
const log = console.log
const DbReader = require("./DbReader")
const DbWriter = require("./DbWriter")


/*
function getByteLength(str) {
    const blob = new Blob([str]);  不支持
    return blob.size;
}
*/

//推荐使用 TextEncoder，因为它简单且高效，并且已经被大多数现代浏览器和 Node.js 支持
function getByteLength(str) {
    if (typeof TextEncoder !== 'undefined') {
        const encoder = new TextEncoder(); 
        const uint8array = encoder.encode(str);
        return uint8array.length;
    } else {
        let byteLength = 0;
        for (let i = 0; i < str.length; i++) {
            const codePoint = str.codePointAt(i);
            if (codePoint <= 0x7F) {
                byteLength += 1;
            } else if (codePoint <= 0x7FF) {
                byteLength += 2;
            } else if (codePoint <= 0xFFFF) {
                byteLength += 3;
            } else {
                byteLength += 4;
                i++; // 因为 codePointAt 对于 surrogate pair 会返回一个完整的 code point
            }
        }
        return byteLength;
    }
}

function TestByte() {

    let byte = new Byte()

    {
        byte.writeFloat32(3.14)
        byte.writeFloat64(3.1415926)
        byte.writeInt32(99)
        byte.writeInt16(-88)
        byte.writeUint16(88)
        byte.writeUint8(7)
        byte.writeInt8(-6)
        byte.writeBigInt(1704038400123)
        byte.writeUTFBytes("hello世界")
        byte.writeUTFString("你好世界abc")
        byte.writeUTFString32("你好世界abc32")
        byte.writeByte(-128)
    }

    let byte2 = new Byte(byte.buffer)
    console.log(byte2.length, byte2)
    {
        log(byte2.readFloat32())
        log(byte2.readFloat64())
        log(byte2.readInt32())
        log(byte2.readInt16())
        log(byte2.readUint16())
        log(byte2.readUint8())
        log(byte2.readInt8())
        log(byte2.readBigInt())
        log(byte2.readUTFBytes(getByteLength("hello世界")))
        log(byte2.readUTFString())
        log(byte2.readUTFString32())
        log(byte2.readByte())
    }
}
TestByte()

function main() {
    const dbWriter = new DbWriter();
    dbWriter.jsonToBin();

    const dbReader = new DbReader();
    // dbReader.binToJson();
}

main()

