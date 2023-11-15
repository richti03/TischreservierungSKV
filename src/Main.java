import java.lang.reflect.Array;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int[][] tisch = {
                {1, 18},
                {2, 18},
                {3, 18},
                {4, 18},
                {5, 18},
                {6, 12},
                {7, 18},
                {8, 24},
                {9, 24},
                {10, 24},
                {11, 24},
                {12, 18},
                {13, 12},
                {14, 18},
                {15, 18},
                {16, 18},
                {17, 18},
                {18, 0},
                {19, 0},
                {20, 0}
        };

        System.out.println("Hallo, aktuell haben unsere Tische folgende Sitzplätze:");
        printTischArray(tisch);

        Scanner scanner = new Scanner(System.in);

        System.out.println("Möchtest du die Sitzplatzanzahl eines Tisches ändern? (j/n)");
        String antwort = scanner.nextLine();

        if (antwort.equalsIgnoreCase("j")) {
            do {
                System.out.println("Bitte Tischnummer eingeben:");
                int tnr = scanner.nextInt();
                if (tnr > 0 && tnr <= tisch.length){
                    System.out.println("Bitte neue Sitzplatzanzahl eingeben:");
                    int plaetze = scanner.nextInt();

                    tisch[tnr-1][1] = plaetze;
                } else {
                    System.out.println("Ungültige Tischnummer!");
                }

                System.out.println("Weiteren Tisch ändern? (j/n)");
                antwort = scanner.next(); // Änderung: next() statt nextLine()
            } while (antwort.equalsIgnoreCase("j"));

            printTischArray(tisch);
        }

        String moreCards;

        do {
            System.out.println("Bitte gib die Anzahl der reservierten Karten an:");
            int cards = scanner.nextInt();

            int tnr = equalCards(cards);
        } while (moreCards.equalsIgnoreCase("j"));
    }

    public static void printTischArray(int[][] arr) {
        for (int i = 0; i < arr.length; i++) {
            for (int j = 0; j < arr[i].length; j++) {
                if (j == 0) {
                    System.out.print("Tisch ");
                }
                System.out.print(arr[i][j] + " ");

                if (j == 1) {
                    System.out.print("Plätze");
                }
            }

            System.out.println("");
        }
    }

    public static void sortTischArrayPlace(int[][] arr){
        Arrays.sort(arr, Comparator.comparingInt(a -> -a[1]));
    }

    public static void sortTischArrayNr(int[][] arr){
        Arrays.sort(arr, Comparator.comparingInt(a -> a[0]));
    }

    public static void equalCards(int cards){

    }
}