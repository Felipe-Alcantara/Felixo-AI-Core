# Guia: assinar e notarizar o Felixo AI Core

Estado atual: nada é assinado. O app do macOS sai com assinatura ad-hoc (o Gatekeeper rejeita) e o
instalador do Windows sai sem assinatura (o SmartScreen avisa). O `release.yml` define
`CSC_IDENTITY_AUTO_DISCOVERY: false` de propósito. Este guia deixa tudo pronto para ligar quando houver conta.

Decisões do Felipe: publicador **pessoa física**; o smoke de quarentena só passa a exigir
aceitação **depois** de assinar. Nada abaixo está ativo no repositório.

Por que não commitar a configuração antes: `hardenedRuntime` e as entitlements mudam o app mesmo sem
certificado (podem quebrar o `node-pty` e o microfone). Só entram junto com a assinatura.

## 1. macOS

### Passo humano: conta Apple Developer (pessoa física)
1. Inscrever-se em https://developer.apple.com/programs/enroll/ com o Apple ID do Felipe (US$ 99/ano;
   o valor em reais aparece no checkout). Exige verificação de identidade; a aprovação pode levar dias.
2. No portal, criar o certificado **Developer ID Application** e exportá-lo do Keychain como `.p12` com senha.
3. Em https://appleid.apple.com, gerar uma **senha específica de app** (a notarização não aceita a senha normal).
4. Anotar o **Team ID** (portal, Membership details).

### Secrets do GitHub (Settings > Secrets and variables > Actions)
| Secret | Conteúdo |
| --- | --- |
| `CSC_LINK` | o `.p12` em base64 (`base64 -i cert.p12`) |
| `CSC_KEY_PASSWORD` | a senha do `.p12` |
| `APPLE_ID` | e-mail do Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | a senha específica de app |
| `APPLE_TEAM_ID` | o Team ID |

### Diff do electron-builder (`app/package.json`, `build.mac`)
```diff
     "mac": {
       "target": ["dmg", "zip"],
       "category": "public.app-category.developer-tools",
+      "hardenedRuntime": true,
+      "entitlements": "installer/entitlements.mac.plist",
+      "entitlementsInherit": "installer/entitlements.mac.plist",
+      "notarize": true,
```
O arquivo `app/installer/entitlements.mac.plist` (com o microfone) vem de outro commit: reaproveite-o,
não crie um segundo. Para o Electron e o `node-pty` rodarem sob hardened runtime ele precisa ter
`com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`,
`com.apple.security.device.audio-input` e, se o `pty.node` não carregar,
`com.apple.security.cs.disable-library-validation`. Confirme os nomes das chaves na versão instalada
(electron-builder ^26.15.3) antes de ligar: não foram verificados.

### Diff do `release.yml` (job `publish`)
```diff
     env:
       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
-      CSC_IDENTITY_AUTO_DISCOVERY: false
```
```diff
       - name: Build installers
         shell: bash
+        env:
+          CSC_LINK: ${{ runner.os == 'macOS' && secrets.CSC_LINK || '' }}
+          CSC_KEY_PASSWORD: ${{ runner.os == 'macOS' && secrets.CSC_KEY_PASSWORD || '' }}
+          APPLE_ID: ${{ runner.os == 'macOS' && secrets.APPLE_ID || '' }}
+          APPLE_APP_SPECIFIC_PASSWORD: ${{ runner.os == 'macOS' && secrets.APPLE_APP_SPECIFIC_PASSWORD || '' }}
+          APPLE_TEAM_ID: ${{ runner.os == 'macOS' && secrets.APPLE_TEAM_ID || '' }}
```
O filtro por sistema impede que o certificado do Mac chegue aos jobs do Linux e do Windows. Como o Linux
passa a rodar sem `CSC_IDENTITY_AUTO_DISCOVERY: false`, confirme no primeiro build que ele não tenta assinar.

Depois de assinar, **então** exigir o smoke: remover `continue-on-error: true` do passo "Validar node-pty
sob quarentena simulada (Gatekeeper)" e fazer o `scripts/release-smoke.cjs` falhar quando
`spctl.accepted` não for `true`. Atualizar também `GUIA-USUARIO.md` (seções do macOS e do Windows),
`README.md` e o aviso automático das notas da release (`release.yml`), que hoje ensina o `xattr`.

### Validar
Smoke de quarentena com `spctl.accepted: true`, `codesign -dv` com `TeamIdentifier` preenchido,
`xcrun stapler validate` ok e atualização automática N para N+1 medida num Mac. Nenhum secret pode
aparecer em log (não imprimir o ambiente).

## 2. Windows

Todo caminho de assinatura confiável exige cadastro externo; certificado autoassinado não é confiado
pelo Windows e não resolve o aviso. Por isso **nada foi assinado** e a escolha fica para depois.

| Caminho | Custo | Cadastro | Observação |
| --- | --- | --- | --- |
| SignPath Foundation | grátis | pedido de adesão em https://signpath.org (projeto de código aberto) | publicador aparece como "SignPath Foundation"; exige que nenhum componente seja proprietário nem haja licença comercial dupla |
| Certificado de CA (OV/EV) | pago, anual (valor varia por CA) | validação de identidade na CA | a chave costuma ficar em token/HSM, o que complica o CI |
| Azure Artifact Signing | US$ 9,99 a 99,99/mês | conta Azure | pela documentação, pessoa física só em EUA e Canadá: o Brasil não consta |

Recomendado, se o projeto cumprir as regras: **SignPath Foundation**.

### Secrets (SignPath)
| Nome | Tipo | Conteúdo |
| --- | --- | --- |
| `SIGNPATH_API_TOKEN` | secret | token do usuário de CI no SignPath |
| `SIGNPATH_ORGANIZATION_ID` | variável | id da organização no SignPath |
| `SIGNPATH_PROJECT_SLUG` | variável | slug do projeto |
| `SIGNPATH_SIGNING_POLICY_SLUG` | variável | slug da política de assinatura |

### Diff do `release.yml` (SignPath, só no job do Windows, depois de "Build installers")
O SignPath assina o artefato já gerado, então precisa de um upload intermediário.
```diff
+      - name: Enviar instalador para assinatura
+        if: runner.os == 'Windows'
+        id: upload-unsigned
+        uses: actions/upload-artifact@v4
+        with:
+          name: instalador-windows-sem-assinatura
+          path: app/release/*.exe
+
+      - name: Assinar com SignPath
+        if: runner.os == 'Windows'
+        uses: signpath/github-action-submit-signing-request@v1
+        with:
+          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
+          organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
+          project-slug: ${{ vars.SIGNPATH_PROJECT_SLUG }}
+          signing-policy-slug: ${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}
+          github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
+          wait-for-completion: true
+          output-artifact-directory: app/release
```
Atenção: o `latest.yml` da atualização automática guarda o hash do instalador. Depois de assinar o hash
muda, então o `latest.yml` precisa ser regenerado a partir do `.exe` assinado. Meça isso antes de ligar.
A sintaxe da Action e dos parâmetros não foi testada: confira na documentação do SignPath.

### Alternativa: certificado de CA
Secrets `WIN_CSC_LINK` (`.pfx` em base64) e `WIN_CSC_KEY_PASSWORD`; o electron-builder assina no próprio
`Build installers`, sem passo extra. Só serve se a chave for um arquivo exportável.

### Validar
`Get-AuthenticodeSignature <instalador>.exe` com `Status` igual a `Valid`. O SmartScreen pode continuar
avisando por um tempo, até o arquivo e o publicador terem histórico de downloads.
