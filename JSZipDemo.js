const JSZip = require("./libs/jszip");
const fs = require("fs");

class JSZipDemo {
    constructor() {
        console.log("JSZipDemo constructor", JSZip);
    }

    async createZip() {
        let zip = new JSZip();
        zip.file("Hello.txt", "Hello World\n");
        let content = await zip.generateAsync({ type: "nodebuffer" });
        console.log("nodebuffer", typeof content, content.length, content);
        return content;
    }

    async extractZip(zipContent) {
        let zip = new JSZip();
        let zipFile = await zip.loadAsync(zipContent);
        let content = await zipFile.file("Hello.txt").async("string");

        if (JSZip.support.uint8array) {
            zip.file("Hello.txt")
                .async("uint8array")
                .then(function (data) {
                    // data is Uint8Array { 0=72, 1=101, 2=108, more...}
                    console.log("uint8array", typeof data, data.length, data);
                });
        }
        return content;
    }

    async runTest1() {
        let zipContent = await this.createZip();
        let content = await this.extractZip(zipContent);
        console.log(content);
    }

    async writeZip() {
        let zip = new JSZip();
        // create a file
        zip.file("hello2.txt", "Hello[p my)6cxsw2q");
        // oops, cat on keyboard. Fixing !
        zip.file("hello2.txt", "Hello World\n");

        // create a file and a folder
        zip.file("nested/hello.txt", "Hello World\n");
        // same as
        zip.folder("nested").file("hello.txt", "Hello World\n");

    //     zip.generateAsync({
    //         type: "nodebuffer", // 压缩类型选择nodebuffer，在回调函数中会返回zip压缩包的Buffer的值，再利用fs保存至本地
    //         compression: "DEFLATE", // STORE：默认不压缩 DEFLATE：需要压缩
    //         compressionOptions: {
    //             level: 7, // 压缩等级1~9    1压缩速度最快，9最优压缩方式，// [使用一张图片测试之后1和9压缩的力度不大，相差100字节左右]
    //         },
    //     }).then((content) => {
    //         fs.writeFile("hello.zip", content, () => {
    //             //    cbk()
    //         });
    //     });
        let content = await zip.generateAsync({ type: "nodebuffer" });  //nodebuffer
        await fs.writeFileSync("hello.zip", content)
        console.log("write zip", content.length, content)
    }

    async readZip() {
        let zip = new JSZip();
        let buffer = await fs.readFileSync("hello.zip");
        let zipFile = await zip.loadAsync(buffer);
        let content = await zipFile.file("hello2.txt").async("string");
        console.log("read zip", content.length, content)
    }

    async runTest2() {
        await this.writeZip();
        await this.readZip();
    }

    async runTest() {
        await this.runTest1();
        await this.runTest2();
    }
}

// module.exports.JSZipDemo = JSZipDemo;  //const { JSZipDemo } = require("./JSZipDemo")
module.exports = JSZipDemo; //const JSZipDemo = require("./JSZipDemo")
