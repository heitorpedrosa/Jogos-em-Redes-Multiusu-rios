const WebSocket = require ( "ws" );

const wss = new WebSocket.Server ( { port: 8080 } );

//Lista de clientes conectados
let clients = {};
//Fila de espera
let waitingClients = [];
//Lista de jogos em andamento
let games = [];

let player = { myBoard: [ [ 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, ],
                          [ 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, ],
                          [ 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, ],
                          [ 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, ],
                          [ 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, ] ],
               board:   [ [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ],
                          [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ] ],
               playerNumber: undefined,
               isTurn: false,
               hit: "",
               points: 5 };

//Conexão
wss.on ( "connection", function connection ( ws ) {
    console.log('Um cliente se conectou.');

    //Gera um identificador único e armazena o estado de jogo para cada cliente 
    ws.id = getUniqueId ();
    clients [ ws.id ] = { ws: ws, player: JSON.parse ( JSON.stringify ( player ) ) };

    //Adiciona o cliente à lista de espera
    waitingClients.push ( clients [ ws.id ] );

    //Tenta montar uma partida com 2 jogadores
    tryMatchPlayers();

    //Mensagem recebida do cliente
    ws.on ( "message", function incoming ( message ) {
        //As mensagens dos clientes são as posições de ataque [ i ] [ j ]
        const data = JSON.parse ( message );
        const hitPosition = data.hit.split ( " " );
        const row = parseInt ( hitPosition [ 0 ] );
        const col = parseInt ( hitPosition [ 1 ] );

        //Acha a partida do cliente que enviou mensagem
        const game = findGameByPlayer ( ws.id );
        if ( !game ) {
            console.log ( "Jogo não encontrado." );
            return;
        }

        //[ row ] [ col ] === 0 => Água
        //[ row ] [ col ] === 1 => Embarcação
        //[ row ] [ col ] === 3 => Bomba ( acertou uma embarcação )
        //[ row ] [ col ] === 4 => Água ( acertou na água )
        const attackingPlayer = game.player1.ws.id === ws.id ? game.player1 : game.player2; //Cliente que enviou a mensagem
        const defendingPlayer = game.player1.ws.id === ws.id ? game.player2 : game.player1; //Cliente que vai sofrer o ataque
        if ( defendingPlayer.player.myBoard [ row ] [ col ] === 1 ) {
            //Alteração do tabuleiro de cada jogador e diminuição dos pontos para o adversário
            attackingPlayer.player.board [ row ] [ col ] = 3;
            defendingPlayer.player.myBoard [ row ] [ col ] = 3;
            defendingPlayer.player.points--;

            //Aviso o status do tiro para cada jogador
            attackingPlayer.ws.send ( "Você acertou o navio adversário." );
            defendingPlayer.ws.send ( "Seu adversário acertou seu navio." );
        }
        else {
            //Alteração do tabuleiro para cada jogador
            attackingPlayer.player.board [ row ] [ col ] = 4;
            defendingPlayer.player.myBoard [ row ] [ col ] = 4;

            //Em caso de tiro na água, muda a vez dos jogadores
            attackingPlayer.player.isTurn = false;
            defendingPlayer.player.isTurn = true;

            //Aviso o status do tiro para cada jogador
            attackingPlayer.ws.send ( "Você acertou a água." );
            defendingPlayer.ws.send ( "Seu adversário acertou a água." );
        }
        //Envia os tabuleiros atualizados para os jogadores
        attackingPlayer.ws.send ( JSON.stringify ( attackingPlayer.player ) );
        defendingPlayer.ws.send ( JSON.stringify ( defendingPlayer.player ) );

        //Checagem de fim de jogo
        if ( defendingPlayer.player.points === 0 ) {
            attackingPlayer.ws.send ( "Você ganhou o jogo." );
            defendingPlayer.ws.send ( "Você perdeu." );
            defendingPlayer.ws.terminate ();
        }
    });

    //Desconexão
    ws.on ( "close", function () {
        console.log ( "Um cliente se desconectou." );
        //Verifica se o cliente desconectado está em um jogo
        for ( let i = 0; i < games.length; i++ ) {
            const game = games [ i ];
            if ( game.player1.ws === ws || game.player2.ws === ws ) {
                //Remove o jogo em que o jogador se desconectou
                games.splice ( i, 1 );
                console.log ( "Jogo " + ( i + 1 ) + " encerrado devido a uma desconexão de jogador." );
                //Verifica qual jogador ainda está conectado
                const remainingPlayer = game.player1.ws === ws ? game.player2 : game.player1;
                if ( remainingPlayer.readyState !== WebSocket.CLOSED ) {
                    //Se o outro jogador ainda estiver conectado, avisa o encerramento do jogo
                    remainingPlayer.ws.send ( "Oponente desconectado. O jogo foi encerrado." );
                    //Adiciona o jogador de volta à lista de espera
                    waitingClients.push ( remainingPlayer );
                    console.log ( "Player adicionado de volta à lista de espera." );
                    //Tenta emparelhar os jogadores novamente
                    tryMatchPlayers ();
                }
                break;
            }
        }
        //Remove o cliente desconectado da lista de espera (se ainda estiver lá)
        waitingClients = waitingClients.filter ( () => waitingClients [ 0 ].ws !== ws );

        //Remove o cliente da lista de clientes
        delete ( clients [ ws.id ] );
    });
});

//Tenta juntar dois jogadores em uma partida
function tryMatchPlayers () {
    //Verifica se há pelo menos dois clientes na lista de espera
    if ( waitingClients.length >= 2 ) {
        //Remove os dois primeiros clientes da lista de espera
        const player1 = waitingClients.shift ();
        const player2 = waitingClients.shift ();

        //Configuração inicial para cada player
        player1.player.myBoard = player.myBoard.map ( row => row.slice () );
        player1.player.board = player.board.map ( row => row.slice () );
        player1.player.playerNumber = 1;
        player1.player.isTurn = true;
        player1.points = 5;

        player2.player.myBoard = player.myBoard.map ( row => row.slice () );
        player2.player.board = player.board.map ( row => row.slice () );
        player2.player.playerNumber = 2;
        player2.player.isTurn = false;
        player2.points = 5;

        // Cria um novo jogo com os dois clientes e o adiciona à lista de jogos em andamento
        const game = { player1: player1, player2: player2 };
        games.push ( game );

        //Envia o estado inicial de cada cliente
        player1.ws.send ( JSON.stringify ( player1.player ) );
        player2.ws.send ( JSON.stringify ( player2.player ) );

        // Notifica os jogadores de que o jogo começou
        player1.ws.send ( "O jogo começou! Você é o Jogador 1." );
        player2.ws.send ( "O jogo começou! Você é o Jogador 2." );

        console.log ( "Partida iniciada." );
    }
    else if ( waitingClients.length === 1 ) {
        const player1 = waitingClients [ 0 ];
        player1.ws.send ( "Aguardando outro jogador entrar." );
    }
}

//Acha em qual partida o player está
function findGameByPlayer ( player ) {
    for ( let i = 0; i < games.length; i++ ) {
        const game = games [ i ];
        if ( game.player1.ws.id === player || game.player2.ws.id === player ) {
            return game;
        }
    }
    return null;
}

//Gera um identificador único para cada cliente
function getUniqueId () {
    function s () {
        return Math.floor ( ( 1 + Math.random () ) * 0x10000 ).toString ( 16 ).substring ( 1 );
    }
    return s () + s () + '-' + s ();
}
