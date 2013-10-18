# Export záznamů Toggl => Clockan

Je to děsně zbastlený, chtěl jsem to rychle zprovoznit a později refaktorovat, ale teď už to asi nechám AS-IS, protože to nikde jinde asi už používat nebudu.

## Instalace

Program potřebuje funkční Node.js a NPM. Na Ubuntu to mimo jiné znamená odinstalovat [Amateur Packet Radio Node program](http://packages.ubuntu.com/lucid/node), což je nějaká linuksácká ptákovina, kterou nikdo nechce a vůbec nechápu, proč je ve výchozí instalaci.

Nainstalujte závislosti:

	npm install

Zkopírujte `config.json-example` na `config.json`, doplňte svoje nastavení:

- togglApiKey - Najdete v Tooglu na "My Profile" dole.
- clockanApiKey - Najdete v Clockanu po kliknutí na svoje jméno nahoře.
- projects - Nalevo název v Togglu, napravo v Clockanu. Pozor na to, že Clockan v API transliteruje do ASCII, takže název projektu v Clockanu uvádějte bez diakritiky.
- startDate/endDate - období, které chcete exportovat. Původně jsem uvažoval, že bych to dal buďto jako argv, nebo nějaký prompt, ale nakonec jsem to nechal v konfigu, protože tak aspoň vím, kde jsem posledně skončil.

## Jak to funguje

	node run.js

Projde všechny časové záznamy v daném období a pošle do Clockana ty, které splňují tyto podmínky:

- Jsou v Toggl projektu, který je uvedený v config.json.
- Clockan ten projekt zná.
- Nemají ještě tag "reported".

Záznamy seskupuje podle popisu a data, 10 záznamů s jedním popiskem v jeden den se většinou nareportuje jako jeden záznam. Toggl svoje exporty stránkuje po padesáti a já každou tu stránku zpracovávám zvlášť, takže občas se to nemusí úplně seskupit.

Záznamy, které se úspěšně odeslaly (Clockan vrátil kód 2xx) se označí tagem "reported" a když pustím export na stejné datum, tak se přeskočí. Toggl u otagovaných záznamů zobrazuje takovou ikonku, takže kdybych třeba blbě nastavil projekt, tak si všimnu, že jsem nějaký záznam neposlal.

Program vypisuje spoustu informací a může být matoucí, že jsou na přeskáčku, třeba výsledky různých API volání, protože se prostě zpracovávají asynchronně a vypisují se, jak to přijde. Měl bych to řešit lépe, ale neřeším.
