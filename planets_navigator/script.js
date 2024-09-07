
document.getElementById('open').addEventListener('click', function() {
    var radio1 = document.getElementById('hane');
    var radio2 = document.getElementById('xan');
    var radio3 = document.getElementById('hellscoast');
    var radio4 = document.getElementById('void');
    var radio5 = document.getElementById('wandacker');
    var radio6 = document.getElementById('draconia');
    var radio7 = document.getElementById('jetaras');
    var radio8 = document.getElementById('saltar');
    var radio9 = document.getElementById('ion');

    // Add more variables if you have more radio buttons

    // Close all overlays
    var overlays = document.getElementsByClassName('details');
    for (var i = 0; i < overlays.length; i++) {
        overlays[i].style.display = 'none';
    }

    if(radio1 && radio1.checked) {
        // Do something for radio1
        const overlay = document.getElementById('hanedetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 1 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio2 && radio2.checked) {
        // Do something for radio2
        const overlay = document.getElementById('xandetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 2 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio3 && radio3.checked) {
        // Do something for radio3
        const overlay = document.getElementById('hellscoastdetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 3 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio4 && radio4.checked) {
        // Do something for radio4
        const overlay = document.getElementById('voiddetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 4 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio5 && radio5.checked) {
        // Do something for radio5
        const overlay = document.getElementById('wandackerdetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 5 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio6 && radio6.checked) {
        // Do something for radio6
        const overlay = document.getElementById('draconiadetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 6 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio7 && radio7.checked) {
        // Do something for radio7
        const overlay = document.getElementById('jetarasdetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 7 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio8 && radio8.checked) {
        // Do something for radio8
        const overlay = document.getElementById('saltardetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 8 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else if(radio9 && radio9.checked) {
        // Do something for radio9
        const overlay = document.getElementById('iondetails');
        overlay.style.boxShadow = ""; // Remove box shadow
        overlay.style.display = 'block';
        console.log('Radio 9 selected');
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    } else {
        console.log('No radio button selected');
    }
});
