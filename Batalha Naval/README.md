#Batalha Naval

##Descrição
Jogo Batalha Naval multijogador. É jogado em um grid 10x10 onde cada jogador deve atacar uma posição inimiga com o objetivo de afundar todas as embarcações do oponente.

##Como jogar
Abra dois clientes em um navegador e tente afundar as embarcações inimigas enviando uma posição do tipo (linha coluna). O jogo acaba quando todas as embarcações forem destruidas.

##Como rodar o servidor
No diretório em que está o arquivo servidor execute os seguintes comandos:
```
#Instalar o módulo WebSocket
$ npm install ws

#Iniciar o servidor
$ node servidor.js
```
