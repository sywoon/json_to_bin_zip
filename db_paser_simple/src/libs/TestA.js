let A = (function (){
    function A() {
        this.name = 'A';
    }

    A.prototype.say = function () {
        console.log("This is " + this.name);
    }

    return A;
})()

export {A}
