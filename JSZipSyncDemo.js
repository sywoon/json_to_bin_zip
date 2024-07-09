const JSZipSync = require("./libs/jszip_sync");
const fs = require("fs");

class JSZipSyncDemo {
    constructor() {}

    createZip() {
        let zip = new JSZipSync();
        // create a file String/ArrayBuffer/Uint8Array/Buffer
        zip.file("hello.txt", "Hello[p my)6cxsw2q");
        // oops, cat on keyboard. Fixing !
        zip.file("hello.txt", "Hello World\n");
        zip.file("hello2.txt", Buffer.from("Hello你好世界\n", "utf8"));
        zip.file("hello3.txt", new ArrayBuffer(4));
        zip.file("hello4.txt", new Uint8Array(4).set([1,3,5,7]));
        zip.file("hello5.txt", "010101");

        // create a file and a folder
        zip.file("nested/hello.txt", "Hello World\n");
        // same as
        zip.folder("nested").file("hello.txt", "Hello World\n");

        var photoZip = zip.folder("photos");
        // this call will create photos/README
        photoZip.file("README", "a folder with photos");

        var data = fs.readFileSync("res/picture.png");
        if (data) {
            photoZip.file("picture.png", data);
        }

        // zip.remove("photos/README");
        // zip.remove("photos");
        // same as
        // zip.remove("photos"); // by removing the folder, you also remove its content.
        var content = null;
        if (JSZipSync.support.uint8array) {
            content = zip.generate({ type: "uint8array" });
        } else {
            content = zip.generate({ type: "string" });
        }
        return content;
    }

    extractZip(zipContent) {
        var zip = new JSZipSync();
        // more files !
        zip.load(zipContent);

        // you now have every files contained in the loaded zip
        let txt = zip.file("hello.txt").asText(); // "Hello World\n"
        console.log("extractZip: hello.txt", txt);

        console.log("hello.txt string", zip.file("hello.txt").asText());
        console.log("hello2.txt string", zip.file("hello2.txt").asNodeBuffer());
        console.log("hello3.txt string", zip.file("hello3.txt").asArrayBuffer());
        console.log("hello4.txt string", zip.file("hello4.txt").asUint8Array());
        console.log("hello5.txt string", zip.file("hello4.txt").asBinary());

        if (JSZipSync.support.uint8array) {
            let u8 = zip.file("hello.txt").asUint8Array(); // Uint8Array { 0=72, 1=101, 2=108, more...}
            console.log("extractZip: hello.txt u8", u8.length, u8);
        }
    }

    readZip() {
        let zip = new JSZipSync();
        let buffer = fs.readFileSync("hello.zip");
        let zipFile = zip.load(buffer);
        // console.log("files", zipFile.files)

        let content = zipFile.file("hello2.txt").asText();
        console.log("readZip: hello2.txt", content);

        {
            let zipobj = zipFile.file("hello2.txt");
            let name = zipobj.name;
            let dir = zipobj.dir;
            let date = zipobj.date;
            let comment = zipobj.comment;
            let dosPermissions = zipobj.dosPermissions;
            let unixPermissions = zipobj.unixPermissions;
            console.log("readZip: hello2.txt", name, dir, date, 
                comment, dosPermissions, unixPermissions);
            let options = zipobj.options;
            console.log("readZip: hello2.txt options", options);
        }

        {
            let zipobj = zipFile.file("photos/picture.png");
            let data = zipobj.asNodeBuffer();
            fs.writeFileSync("picture.png", data);
        }
    }

    runTest1() {
        let zipContent = this.createZip();
        fs.writeFileSync("hello.zip", zipContent)

        this.extractZip(zipContent);
        this.readZip();
    }

    runTest() {
        this.runTest1();
    }
}

module.exports = JSZipSyncDemo;
