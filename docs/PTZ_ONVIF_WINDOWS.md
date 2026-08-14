# Controle PTZ ONVIF no Windows 11

## Visão geral

A integração adiciona controle de movimento da câmera Intelbras VIP 1300 MINI SD pelo servidor local do detector. A interface do navegador envia somente comandos abstratos — cima, baixo, esquerda, direita, parar e posição inicial — para o servidor Express. As credenciais ONVIF permanecem exclusivamente no arquivo `.env` do servidor e nunca são enviadas para o navegador.

O protocolo ONVIF padroniza, entre outras operações, `ContinuousMove`, `Stop`, `GetStatus` e `GotoHomePosition` para dispositivos PTZ [1]. A implementação Node utilizada pelo projeto oferece esses métodos por meio da API de promessas [2].

> **Importante:** esta integração usa o usuário ONVIF da câmera, que pode ser diferente do usuário usado para abrir a interface web ou do usuário usado no fluxo RTSP. A conta ONVIF precisa ter permissão suficiente para atuar no PTZ.

## Pré-requisitos

Antes de iniciar o detector, confirme que a câmera está acessível pelo computador Windows 11 e que o MediaMTX continua publicando o stream no endereço já validado:

| Item | Valor usado no teste local |
|---|---|
| Câmera | Intelbras VIP 1300 MINI SD |
| IP local | `192.168.15.2` |
| Porta RTSP | `554` |
| URL RTSP | `rtsp://usuario:SENHA@192.168.15.2:554/cam/realmonitor?channel=1&subtype=1` |
| URL HLS do MediaMTX | `http://localhost:8888/intelbras/index.m3u8` |
| Porta do detector | `3000` |
| Porta ONVIF inicial | `80`, se a câmera utilizar a porta HTTP padrão |

A porta ONVIF deve ser confirmada na configuração de rede da própria câmera. Se a interface web for acessada por uma porta diferente, informe essa porta em `CAMERA_ONVIF_PORT`.

## Criar ou confirmar o usuário ONVIF

Abra a interface da câmera em `http://192.168.15.2/` e localize a seção de usuários ONVIF nas configurações de rede. Crie uma conta exclusiva para o servidor do detector, com nome e senha diferentes dos utilizados no navegador e no RTSP. Conceda perfil de operador ou administrador conforme a política de segurança do ambiente; uma conta somente de visualização normalmente não poderá executar movimentos.

Como a senha da câmera foi exposta anteriormente em uma captura de tela, ela deve ser trocada antes do teste. Não coloque a nova senha em commits, no `.env.example`, em screenshots ou no campo de URL do navegador.

## Configurar o arquivo `.env`

Na pasta raiz do projeto, faça uma cópia de `.env.example` chamada `.env`. Em uma instalação padrão do Windows, a pasta será aquela em que o projeto foi clonado, por exemplo `C:\detector-pessoas-camera`. Preencha as variáveis abaixo com a conta ONVIF criada na câmera:

```dotenv
CAMERA_PTZ_ENABLED=true
CAMERA_ONVIF_HOST=192.168.15.2
CAMERA_ONVIF_USERNAME=usuario_onvif
CAMERA_ONVIF_PASSWORD=COLOQUE_A_NOVA_SENHA_AQUI
CAMERA_ONVIF_PORT=80
```

O valor `CAMERA_PTZ_ENABLED` funciona como uma chave geral de segurança. Mantenha-o como `false` até que a conta, a porta e a conectividade tenham sido conferidas. O arquivo `.env` não deve ser adicionado ao Git.

As credenciais informadas no modal **Câmera IP** continuam sendo as credenciais de leitura do gateway HLS, caso sejam necessárias. Elas não substituem as credenciais ONVIF do servidor.

## Iniciar e verificar

Feche qualquer processo antigo do detector para evitar que uma instância utilize variáveis antigas. Na pasta do projeto, execute:

```powershell
pnpm install
pnpm dev
```

Com o servidor rodando, abra o detector em `http://localhost:3000`, conecte a fonte **Câmera IP** e mantenha a URL HLS local já validada. O painel **Controle PTZ** aparecerá somente quando a fonte ativa for uma câmera IP.

Antes de movimentar a câmera pela interface, teste o status no PowerShell:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/camera/ptz/status" |
  ConvertTo-Json -Depth 6
```

Uma resposta bem-sucedida contém `connected: true` e informações do fabricante ou modelo. O servidor retorna erro `503` quando o PTZ está desativado ou quando faltam variáveis do `.env`; erros de comunicação ou autenticação são retornados como `502`.

## Testar um comando por vez

Depois de confirmar o status, envie um movimento curto. A duração é limitada pelo servidor a uma faixa entre 150 e 1500 milissegundos; a interface usa 450 milissegundos para reduzir o risco de movimento contínuo acidental.

```powershell
$body = @{ direction = "left"; durationMs = 450 } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/camera/ptz/move" `
  -ContentType "application/json" `
  -Body $body
```

Para parar imediatamente qualquer movimento:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/camera/ptz/stop"
```

Para solicitar a posição inicial configurada na câmera:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/camera/ptz/home"
```

Se a câmera não tiver uma posição inicial configurada, o comando `home` poderá ser rejeitado ou não produzir movimento. Nesse caso, configure a posição inicial na interface da câmera e repita o teste.

## Diagnóstico de falhas

| Sintoma | Verificação recomendada |
|---|---|
| `PTZ desativado` | Confirme `CAMERA_PTZ_ENABLED=true` e reinicie `pnpm dev`. |
| `configuração ONVIF incompleta` | Confira host, usuário, senha e porta no `.env`; não use aspas curvas. |
| Timeout ou conexão recusada | Teste `Test-NetConnection 192.168.15.2 -Port 80` e confirme a porta ONVIF na câmera. |
| Falha de autenticação | Confirme que o usuário é o usuário ONVIF e que a senha foi digitada corretamente. |
| Status conecta, mas movimento é recusado | Dê permissão PTZ à conta ONVIF e confirme que o perfil ONVIF selecionado possui configuração PTZ. |
| Cima e baixo invertidos | Algumas câmeras podem apresentar orientação diferente; confirme a orientação do dispositivo antes de alterar o mapeamento no servidor. |
| O painel não aparece | Selecione a fonte **Câmera IP**; o painel é intencionalmente ocultado para arquivos, webcam e vídeos de demonstração. |

## Segurança para acesso remoto

O controle foi desenhado para funcionar atrás do servidor local do detector. Não publique diretamente a porta `3000` na internet sem uma camada de autenticação, VPN ou proxy reverso protegido. Quem puder alcançar as rotas `POST /api/camera/ptz/*` poderá solicitar movimentos, ainda que não conheça a senha ONVIF. Para acesso remoto com vários usuários, recomenda-se colocar o detector atrás de autenticação e TLS no gateway, mantendo a câmera e as credenciais ONVIF na rede privada.

## Rotas implementadas

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/camera/ptz/status` | Valida a conexão ONVIF e retorna informações básicas e status PTZ. |
| `POST` | `/api/camera/ptz/move` | Executa movimento direcional breve com duração limitada. |
| `POST` | `/api/camera/ptz/stop` | Interrompe pan, tilt e zoom em andamento. |
| `POST` | `/api/camera/ptz/home` | Solicita retorno à posição inicial ONVIF. |

## Referências

[1]: https://www.onvif.org/specs/2306/ONVIF-PTZ-Service-Spec-v2306.pdf "ONVIF PTZ Service Specification, Version 23.06"

[2]: https://github.com/agsh/onvif "agsh/onvif — ONVIF Node.js implementation"
