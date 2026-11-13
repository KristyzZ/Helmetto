# Helmetto ESP8266

Šalmo ESP8266 kas sekundę siunčia vieno baito heartbeat (`0x01`) per ESP-NOW į paspirtuko STA MAC `68:C6:3A:A0:59:45`. Abu įrenginiai naudoja 2,4 GHz 11 kanalą. Paspirtukas seka šalmo ryšį ir maždaug kas 10 ms nuskaito Joy-IT SEN-MPU6050 pagreitį ir giroskopą. Matavimai į Serial Monitor išvedami kas 500 ms.

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
3. Prisijungęs paspirtukas naudoja 2,4 GHz prieigos taško kanalą. Serial Monitor rodo faktinį kanalą po prisijungimo. Jei tinklas naudoja kitą kanalą nei 11, pakeisk WIFI_CHANNEL abiejuose sketch’uose ir įkelk juos iš naujo.
4. Kiekvienam įrenginiui atidaryk atitinkamą `.ino`, pasirink plokštę ir USB prievadą, tada spausk **Upload**. NodeMCU plokštei rinkis **NodeMCU 1.0 (ESP-12E Module)**. Atskirą ESP8266 modulį programuojant per adapterį rinkis **Generic ESP8266 Module** ir naudok 3,3 V logikos lygius.
5. Paspirtuko **Serial Monitor** nustatyk **115200 baud**. Jei paspirtuko STA MAC skiriasi nuo aukščiau nurodyto adreso, pakeisk `receiverMac` šalmo sketch'e ir įkelk jį iš naujo.

## Patikra su įranga

- Įjungus paspirtuką matysi `Waiting for helmet...`. Prijungus jutiklį turėtų pasirodyti `MPU6050 initialized` ir ACC bei GYRO matavimai. Ramybės būsenoje pagreičio vektoriaus ilgis turėtų būti maždaug 1 g, o giroskopo reikšmės arti nulio.
- Įjungus šalmą, paspirtukas po pirmo paketo rodo `HELMET CONNECTED!`.
- Išjungus šalmą, praėjus 3 s nuo paskutinio paketo, pasirodo `Helmet signal lost, waiting...`, o praėjus 15 s – `ALERT: HELMET DISCONNECTED!`. Vėl įjungus šalmą, paspirtukas grįžta į `HELMET CONNECTED!`.

Paspirtukui užfiksavus bendrą pagreitį nuo 2,5 g, Serial Monitor rodo `IMPACT` ir išmatuotą pagreitį. Tai bandomasis slenkstis. Akselerometro diapazonas yra ±8 g, o Z ašiai taikoma su šiuo moduliu išmatuota +0,11 g korekcija.

## Programėlės telemetrija

1. Paleisk komandos API pagal [projekto README](../README.md). Vietiniam bandymui naudok kompiuterio LAN IP adresą, pasiekiamą iš paspirtuko 2,4 GHz tinklo. Pavyzdžiui, `http://192.168.1.20:3000/api/devices/scooter-001/telemetry`.
2. Nukopijuok `scooter_esp/telemetry_config.example.h` į `scooter_esp/telemetry_config.h`. Įrašyk visą telemetrijos URL į `TELEMETRY_URL` ir API nustatytą įrenginio raktą į `TELEMETRY_DEVICE_KEY`. Įrenginio ID URL turi sutapti su serverio `DEVICE_ID`. Vietinį failą ignoruoja „Git“.
3. HTTP naudok vietiniame bandomajame tinkle. Diegimui naudok HTTPS ir į `TELEMETRY_CA_PEM` įrašyk serverio patikimos šakninės CA PEM sertifikatą (galima naudoti C++ `R"PEM(...)PEM"` eilutę). ESP8266 prieš HTTPS sinchronizuoja laiką.
4. Iš naujo įkelk sketch’ą. Programėlėje patikrink įrenginio būseną ir pranešimus. Jei Serial Monitor rodo 401, patikrink raktą. Jei rodo 404, patikrink URL ir įrenginio ID.

Paspirtukas kas 5 s siunčia POST su `helmet_connected` ir `crash_detected`. Vietinis 3 s perspėjimas išlieka. Programėlėje šalmas laikomas prisijungusiu iki 15 s nuo paskutinio signalo. Smūgis išlaikomas iki sėkmingo API atsakymo, o kitas siuntimas be naujo smūgio išvalo aktyvų perspėjimą. Iki vieno sėkmingo siuntimo keli smūgiai sujungiami į vieną signalą. GPS, greitis, baterija ir šalmo dėvėjimas programėlėje lieka nežinomi.

ESP8266 HTTP užklausa vykdoma sinchroniškai, todėl jos metu MPU6050 nuskaitymas trumpam pristabdomas. [API kontraktas](../shared/PROTOCOL.md)

## FSR402 ir vietos demonstracija

Šalmo FSR402 skaitomas per A0. Bandomasis dėvėjimo slenkstis yra 50. Įkelk abu sketch'us ir nustatyk šalmo kanalą pagal paspirtuko naudojamą Wi-Fi kanalą. Paspirtukas priima ir seną vieno baito heartbeat. Tokiu atveju dėvėjimo būsena lieka nežinoma.

Paspirtuko sketch'ui per Arduino Library Manager įdiek TinyGPSPlus. Pagal numatytąjį nustatymą `USE_DEMO_LOCATION = true` į žemėlapį siunčia fiksuotą ISM vietą Vilniuje. Jei nori naudoti tikrą GPS vietą, nustatyk `USE_DEMO_LOCATION = false` ir prijunk GPS TX prie GPIO12 (D6).

## GPS ir vienkartinė Wi-Fi vieta

Nustatykite USE_DEMO_LOCATION į false GPS režimui. Jei po 30 s nuo paleidimo
GPS dar neturi vietos, prisijungęs paspirtukas vieną kartą nuskenuoja aplinkinius
Wi-Fi taškus. Norint pakartoti skenavimą, reikia perkrauti paspirtuką. Serverio
vietiniame .env faile nustatykite WIFI_GEOLOCATION_API_KEY su įjungta Google
Geolocation API ir iš naujo paleiskite API. Serveriui reikia interneto prieigos.
Sėkminga užklausa žemėlapyje rodoma kaip apytikslė vieta su paklaidos spinduliu
metrais. Naujas GPS rodmuo turi pirmenybę. ISM režimui nustatykite
USE_DEMO_LOCATION į true.
