var tisch = [
    [1, 18],
    [2, 18],
    [3, 18],
    [4, 18],
    [5, 18],
    [6, 12],
    [7, 18],
    [8, 24],
    [9, 24],
    [10, 24],
    [11, 24],
    [12, 18],
    [13, 12],
    [14, 18],
    [15, 18],
    [16, 18],
    [17, 18],
    [18, 0],
    [19, 0],
    [20, 0]
]

var alleAktionen = "";

function printTischArray(arr) {
    sortTischArrayNr(arr);
    var output = "";
    for (var i = 0; i < arr.length; i++) {
        for (var j = 0; j < arr[i].length; j++) {
            if (j === 0) {
                output += "Tisch ";
            }
            output += arr[i][j];

            if (j === 1) {
                output += " Plätze";
            } else {
                output += ": ";
            }
        }

        output += "<br>";
    }

    document.getElementById("tischAusgabe").innerHTML = output;
}

function sortTischArrayPlace(arr) {
    arr.sort(function (a, b) {
        return b[1] - a[1];
    });
}

function sortTischArrayNr(arr) {
    arr.sort(function (a, b) {
        return a[0] - b[0];
    });
}

function changePlätze() {
    var tnr = prompt("Bitte Tischnummer eingeben:");
    var plaetze = prompt("Bitte neue Sitzplatzanzahl eingeben:");

    if (tnr > 0 && tnr <= tisch.length) {
        tisch[tnr - 1][1] = parseInt(plaetze);
    } else {
        alert("Ungültige Tischnummer!");
    }

    printTischArray(tisch);
}

function berechneReservierung() {
    var name = prompt("Bitte gib den Namen des Kunden ein:")
    var cards = prompt("Bitte gib die Anzahl der reservierten Karten an:");

    sortTischArrayPlace(tisch);
    reservierteKarten(tisch, parseInt(cards), name);

    printTischArray(tisch);
}

function reservierteKarten(t, c, n) {
    var restCards = c;
    var alertMessage = "";

    for (var i = 0; i < t.length; i++) {
        if (c === t[i][1]) {
            alertMessage += n + "\nTisch " + t[i][0] + ": " + c + " Karten";
            t[i][1] = 0;
            alert(alertMessage);
            console.log(alertMessage);
            alleAktionen += alertMessage +"\n";
            return;
        }
    }

    if (t[0][1] < restCards) {
        var counter = 0;
        alertMessage += n + "\n";
        do {
            if (t[counter][1] < restCards) {
                alertMessage += "Tisch " + t[counter][0] + ": " + t[counter][1] + " Karten\n";
                restCards -= t[counter][1];
                t[counter][1] = 0;
            } else {
                alertMessage += "Tisch " + t[counter][0] + ": " + restCards + " Karten\n";
                t[counter][1] -= restCards;
                restCards = 0;
            }
            counter++;
        } while (restCards > 0 && counter < t.length);
    } else {
        alertMessage += n + "\nTisch " + t[0][0] + ": " + restCards + " Karten\n";
        t[0][1] -= restCards;
    }

    alert(alertMessage);
    console.log(alertMessage)
    alleAktionen += alertMessage +"\n";
}



function berechneExport() {
    var exportString = "";
    for (var i = 0; i < tisch.length; i++) {
        exportString += tisch[i][0] + ":" + tisch[i][1];
        if (i < tisch.length - 1) {
            exportString += ",";
        }
    }

    alert("Bitte speichere dir folgenden Code, wenn du demnächst weitere Reservierungen berechnen möchtest:\n\n" + exportString);
}

function verarbeiteImport() {
    var importCode = prompt("Bitte gib deinen Importcode ein:");

    if (importCode) {
        verarbeiteImportCode(importCode);
    }
}

function verarbeiteImportCode(tischString) {
    var tischTeile = tischString.split(",");
    for (var i = 0; i < tischTeile.length; i++) {
        var tischInfo = tischTeile[i].split(":");
        var tischNummer = parseInt(tischInfo[0]);
        var karten = parseInt(tischInfo[1]);
        tisch[tischNummer - 1][1] = karten;
    }

    printTischArray(tisch);
}

function alleAktionenAusgeben(){
    alert(alleAktionen);
}


// Initialausgabe
printTischArray(tisch);
