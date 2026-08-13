# Teste local no Windows 11: câmera Intelbras, MediaMTX e detector

Este roteiro é para o cenário em que a câmera Intelbras e o computador com Windows 11 estão ligados ao **mesmo roteador ou switch**. Neste teste não há domínio, HTTPS, encaminhamento de portas nem acesso externo. O objetivo é confirmar que a câmera fornece RTSP e que o MediaMTX gera uma URL HLS que o detector consegue abrir.

> A URL final deste teste será local: `http://localhost:8888/intelbras/index.m3u8`. Ela funciona somente no computador que executa o MediaMTX. A URL HTTPS pública será configurada depois, quando o teste local estiver aprovado.

## Etapa 1 — conectar e localizar a câmera

Ligue a câmera ao switch ou roteador por cabo de rede e conecte o computador Windows ao mesmo equipamento. Aguarde cerca de dois minutos para a câmera inicializar e receber um IP da rede.

Abra a página administrativa do roteador e procure a lista de dispositivos DHCP/conectados. Localize a câmera Intelbras e anote o endereço IPv4, por exemplo `192.168.1.50`. Se possível, crie uma reserva DHCP para esse equipamento, para que ele continue usando o mesmo IP.

Se não localizar a câmera no roteador, use o programa oficial de descoberta da Intelbras ou verifique a lista ARP no **Prompt de Comando**:

```bat
arp -a
```

A lista mostra dispositivos que o computador já enxergou, mas o roteador ou a ferramenta de descoberta é a melhor forma de confirmar qual IP é da câmera.

## Etapa 2 — validar a interface e o RTSP

No navegador, abra:

```text
http://IP_DA_CAMERA
```

Substitua `IP_DA_CAMERA` pelo valor localizado, por exemplo `http://192.168.1.50`. Entre na câmera com sua conta administrativa e localize as configurações de vídeo, RTSP ou ONVIF. Ative RTSP caso esteja desativado e configure o stream destinado à integração como **H.264**. A VIP 1300 MINI SD suporta RTSP e H.264 [1].

A URL RTSP exata muda conforme o firmware e o perfil de stream. Obtenha o caminho na interface da câmera, na documentação da Intelbras, no NVR ou via ONVIF. O padrão geral é:

```text
rtsp://USUARIO:SENHA@IP_DA_CAMERA:554/CAMINHO_DO_STREAM
```

Antes de configurar o MediaMTX, teste esse RTSP no VLC instalado no Windows:

1. Abra o VLC.
2. Clique em **Mídia > Abrir fluxo de rede**.
3. Cole a URL RTSP.
4. Clique em **Reproduzir**.

Se o VLC não mostrar a imagem, interrompa aqui e corrija o IP, a conta, a senha, a porta, o caminho RTSP ou a configuração H.264. O MediaMTX só funcionará depois que o RTSP passar nesse teste.

## Etapa 3 — instalar o Docker Desktop

Instale o Docker Desktop para Windows e confirme que ele está em execução. Em seguida, abra o **PowerShell** e confirme a instalação:

```powershell
docker --version
docker compose version
```

Os dois comandos precisam exibir uma versão. Se aparecer uma mensagem de erro, inicie o Docker Desktop e aguarde ele informar que está pronto.

## Etapa 4 — preparar o gateway local

Abra o PowerShell e copie o projeto para o computador, caso ainda não esteja nele:

```powershell
git clone https://github.com/neo-vision1/detector-pessoas.git
cd detector-pessoas\gateway
Copy-Item .env.local.example .env
notepad .env
```

No Bloco de Notas, substitua os valores de exemplo. O campo mais importante é `CAMERA_RTSP_URL`. Exemplo de estrutura:

```env
APP_ORIGIN=http://localhost:5173
CAMERA_RTSP_URL=rtsp://USUARIO:SENHA@192.168.1.50:554/CAMINHO_DO_STREAM
STREAM_USER_1=teste
STREAM_PASS_1=crie-uma-senha-de-teste
STREAM_USER_2=operador
STREAM_PASS_2=crie-outra-senha
```

Não envie esse arquivo e não o publique no GitHub: ele contém a senha da câmera. As contas `STREAM_USER_*` são contas de leitura do HLS e não precisam ser iguais à conta administrativa da Intelbras.

## Etapa 5 — iniciar o MediaMTX em modo local

Ainda na pasta `gateway`, execute exatamente este comando:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

O arquivo `docker-compose.local.yml` expõe a porta HLS somente em `localhost` e deixa o proxy HTTPS remoto desativado. Confira se o container iniciou:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f mediamtx
```

O MediaMTX busca o RTSP somente quando alguém solicita o vídeo, usando a opção `sourceOnDemand` [2]. Portanto, é normal que a tentativa de conexão com a câmera apareça nos logs somente quando você abrir o HLS.

## Etapa 6 — testar o HLS no próprio computador

Abra o navegador no mesmo Windows e acesse:

```text
http://localhost:8888/intelbras
```

Se o navegador solicitar usuário e senha, use `STREAM_USER_1` e `STREAM_PASS_1` do arquivo `.env`. A página deve mostrar o stream da câmera.

A playlist técnica que será usada no detector é:

```text
http://localhost:8888/intelbras/index.m3u8
```

O MediaMTX utiliza o formato `/nome-do-stream/index.m3u8` para a playlist HLS [3].

## Etapa 7 — iniciar e conectar o detector

Abra outro PowerShell na raiz do projeto e inicie o software:

```powershell
cd detector-pessoas
pnpm install
pnpm dev
```

Abra o endereço exibido pelo comando, normalmente `http://localhost:5173`. No cabeçalho do software:

1. Clique em **Câmera IP**.
2. Informe um nome para a câmera.
3. Cole a URL:

   ```text
   http://localhost:8888/intelbras/index.m3u8
   ```

4. Informe o usuário de leitura, por exemplo `teste`.
5. Informe a senha definida em `STREAM_PASS_1`.
6. Clique em **Conectar câmera**.

Se o vídeo abrir no canvas e a detecção começar, o teste local foi aprovado. O HLS com JavaScript permite que o software leia os frames da câmera no elemento de vídeo [4].

## Diagnóstico rápido

| Erro | Verificação |
|---|---|
| A câmera não aparece no roteador | Confira energia, cabo, porta do switch e DHCP; use a ferramenta de descoberta da Intelbras. |
| O RTSP não abre no VLC | Revise a URL RTSP, credenciais, porta, caminho e stream H.264. |
| O container inicia, mas não há imagem | Abra os logs do MediaMTX e compare a URL RTSP com a que funcionou no VLC. |
| `401 Unauthorized` | Use o usuário/senha `STREAM_USER_*` do `.env`, não a conta da câmera. |
| `404` na URL HLS | Use exatamente `/intelbras/index.m3u8` e mantenha o nome de stream configurado. |
| O software abre, mas não exibe vídeo | Confirme que ele está em `http://localhost:5173` e que `APP_ORIGIN` tem esse mesmo valor. |
| Porta 8888 em uso | Feche o serviço que utiliza a porta ou altere o mapeamento em `docker-compose.local.yml`. |

## Depois do teste

Para desligar os containers locais:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

Quando a imagem funcionar localmente, a próxima etapa é configurar um domínio HTTPS e substituir a URL `localhost` por uma URL remota protegida. Não reutilize a configuração de teste local diretamente na internet.

## Referências

[1]: https://backend.intelbras.com/sites/default/files/2026-06/Datasheet%20VIP%201300%20MINI%20SD%20%28V10%29_0.pdf "Intelbras VIP 1300 MINI SD — ficha técnica oficial"

[2]: https://mediamtx.org/docs/references/configuration-file "MediaMTX — referência de configuração"

[3]: https://mediamtx.org/docs/read/hls "MediaMTX — leitura HLS"

[4]: https://mediamtx.org/docs/read/web-browsers "MediaMTX — HLS com JavaScript em navegador"
