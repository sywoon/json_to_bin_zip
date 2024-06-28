const Byte = require ("./Byte").Byte
const msgpack5 = require("msgpack5")
const bl = require('bl')
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

function toUInt8array(uInt8List){
    var length = 0;
    uInt8List.forEach(function(item, index, array){length += item.byteLength;});
    var ul = new Uint8Array(length);
    var offset = 0;
    uInt8List.forEach(function(item, index, array)
        {ul.set(item, offset); offset += item.byteLength;});
    return ul;
}

function TestMsgPack() {
    console.log("---TestMsgPack---begin---")
    let mp = new msgpack5()
    let u8arr = null
    {
        let buffs = [
            mp.encode(3.14),
            mp.encode(3.1415926),
            mp.encode(99),
            mp.encode(-88),
            mp.encode(88),
            mp.encode(7),
            mp.encode(-6),
            mp.encode(1704038400123),
            mp.encode("hello世界"),
            mp.encode(-128),

            mp.encode(null),
            mp.encode(-1.12),
            mp.encode(-3),
            mp.encode("你好nihao"),
            mp.encode({a:1, b:2, c:3}),
            mp.encode([11, 22, 33]),
        ]
        u8arr = toUInt8array(buffs)
    }

    console.log("---TestMsgPack---read---")

    let buf = bl(u8arr)
    let byte2 = new msgpack5()
    console.log("all buffer", buf.length, buf)
    {
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))

        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
        log(byte2.decode(buf))
    }
    console.log("---TestMsgPack---end---")
}

function TestByte() {
    console.log("---TestByte---begin---")
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

        byte.writeAny(null)
        byte.writeAny(-1.12)
        byte.writeAny(-3)
        byte.writeAny("你好nihao")
        byte.writeAny({a:1, b:2, c:3})
        byte.writeAny([11, 22, 33])
    }

    console.log("---TestByte---read---")

    let byte2 = new Byte(byte.buffer)
    console.log("all buffer", byte2.length, byte2)
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

        log(byte2.readAny())
        log(byte2.readAny())
        log(byte2.readAny())
        log(byte2.readAny())
        log(byte2.readAny())
        log(byte2.readAny())
    }
    console.log("---TestByte---end---")
}

TestMsgPack()
TestByte()

function main() {
    const dbWriter = new DbWriter();
    // dbWriter.jsonToBin();

    const dbReader = new DbReader();
    dbReader.binToJson();
}

main()

