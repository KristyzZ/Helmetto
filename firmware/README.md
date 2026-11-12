# Helmetto ESP8266

Šalmo ESP8266 kas sekundę siunčia vieno baito heartbeat (`0x01`) per ESP-NOW į paspirtuko STA MAC `68:C6:3A:A0:59:45`. Abu įrenginiai naudoja 2,4 GHz 6 kanalą. Paspirtukas seka šalmo ryšį ir maždaug kas 10 ms nuskaito Joy-IT SEN-MPU6050 pagreitį ir giroskopą. Matavimai į Serial Monitor išvedami kas 500 ms.

| Arduino sketch'as | Įrenginys |
| --- | --- |
| [helmet_esp.ino](helmet_esp/helmet_esp.ino) | Šalmas |
| [scooter_esp.ino](scooter_esp/scooter_esp.ino) | Paspirtukas |

## Jutiklio prijungimas

Atjunk paspirtuko ESP8266 maitinimą prieš jungdamas laidus.

| Joy-IT SEN-MPU6050 | Paspirtuko ESP8266 | NodeMCU žyma |
| --- | --- | --- |
| VCC | 3,3 V | 3V3 |
| GND | GND | GND |
| SDA | GPIO4 | D2 |
| SCL | GPIO5 | D1 |

`AD0` palik neprijungtą, kad I²C adresas liktų `0x68`. `XDA`, `XCL` ir `INT` šioje schemoje nenaudojami. [Joy-IT modulio instrukcija](https://joy-it.net/files/files/Produkte/SEN-MPU6050/SEN-MPU6050_Manual_2024-04-15.pdf)

## Įkėlimas per Arduino IDE

1. Pridėk `https://arduino.esp8266.com/stable/package_esp8266com_index.json` prie **Additional Boards Manager URLs**. Per **Boards Manager** įdiek **esp8266 by ESP8266 Community**. `Wire`, `ESP8266WiFi` ir `espnow.h` pateikiami kartu su paketu.
2. Paspirtuko aplanke nukopijuok `wifi_config.example.h` į `wifi_config.h` ir įrašyk vietinio tinklo duomenis. `wifi_config.h` ignoruojamas „Git“. Be šio failo sketch'as paleidžiamas ESP-NOW bandymui be prisijungimo prie Wi-Fi tinklo.
3. Prieigos taške nustatyk 2,4 GHz 6 kanalą. Prisijungęs paspirtukas naudoja prieigos taško kanalą, todėl jis turi sutapti su šalmo kanalu. Serial Monitor rodo faktinį kanalą po prisijungimo.
4. Kiekvienam įrenginiui atidaryk atitinkamą `.ino`, pasirink plokštę ir USB prievadą, tada spausk **Upload**. NodeMCU plokštei rinkis **NodeMCU 1.0 (ESP-12E Module)**. Atskirą ESP8266 modulį programuojant per adapterį rinkis **Generic ESP8266 Module** ir naudok 3,3 V logikos lygius.
5. Paspirtuko **Serial Monitor** nustatyk **115200 baud**. Jei paspirtuko STA MAC skiriasi nuo aukščiau nurodyto adreso, pakeisk `receiverMac` šalmo sketch'e ir įkelk jį iš naujo.

## Patikra su įranga

- Įjungus paspirtuką matysi `Waiting for helmet...`. Prijungus jutiklį turėtų pasirodyti `MPU6050 initialized` ir ACC bei GYRO matavimai. Ramybės būsenoje pagreičio vektoriaus ilgis turėtų būti maždaug 1 g, o giroskopo reikšmės arti nulio.
- Įjungus šalmą, paspirtukas po pirmo paketo rodo `HELMET CONNECTED!`.
- Išjungus šalmą, praėjus 3 s nuo paskutinio paketo, pasirodo `Helmet signal lost, waiting...`, o praėjus 15 s – `ALERT: HELMET DISCONNECTED!`. Vėl įjungus šalmą, paspirtukas grįžta į `HELMET CONNECTED!`.

Paspirtukui užfiksavus bendrą pagreitį nuo 2,5 g, Serial Monitor rodo `IMPACT` ir išmatuotą pagreitį. Tai bandomasis slenkstis. Akselerometro diapazonas yra ±8 g, o Z ašiai taikoma su šiuo moduliu išmatuota +0,11 g korekcija.

Būsima integracija siųs paspirtuko telemetriją per HTTP į komandos kuriamą API. Dabartiniame variante šalmo būsena ir MPU6050 matavimai rodomi per Serial Monitor.
