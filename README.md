# AgroSync — Sistema de Monitoramento de Fertirrigação
### Manual de Manutenção para Leigos
**Versão v9 — Usina Pitangueiras**

---

## 📖 O que é este sistema?

O AgroSync é um painel web que exibe em tempo real o nível de líquido nas 5 lagoas de fertirrigação da usina. Os sensores ESP32 instalados em cada lagoa enviam os dados automaticamente para a internet (Firebase), e o painel atualiza os cards automaticamente — sem precisar recarregar a página.

---

## 🗂️ Estrutura de Pastas

```
agrosync/
├── index.html                  ← Arquivo principal — abra este no navegador
├── README.md                   ← Este arquivo
│
├── css/                        ← Estilos visuais
│   ├── style_global.css        ← Tema global, cores, layout
│   ├── ferti.css               ← Estilos antigos (mantido para compatibilidade)
│   ├── tratos.css              ← Estilos do Dashboard/Implementos
│   ├── dashboard/              ← CSS do módulo Dashboard
│   └── fertirrigacao/          ← CSS do módulo Fertirrigação
│       ├── cards.css           ← Cards das lagoas
│       ├── analisetemporeal.css
│       ├── vazaolagoa.css
│       ├── volume.css
│       └── metaaplic.css
│
└── js/                         ← Lógica do sistema
    ├── main.js                 ← Ponto de entrada (carrega tudo)
    ├── auth.js                 ← Login / autenticação Firebase
    ├── api.js                  ← Comunicação com API back-end
    ├── firebase-config.js      ← Configuração do Firebase principal
    │
    ├── fertirrigacao/          ← Módulo de Fertirrigação
    │   ├── index.js            ← Orquestrador da aba
    │   ├── firebase.js         ← Conexão com Firebase ESP32 ⚙️
    │   ├── lagoas.js           ← Cards das lagoas + lógica de atualização
    │   ├── vazao.js            ← Vazão, acumulados e meta
    │   ├── insights.js         ← Análise operacional inteligente
    │   ├── chart.js            ← Gráfico de níveis
    │   ├── input.js            ← Configuração das dimensões dos tanques
    │   ├── regras.js           ← Cálculo de volume (fórmula tronco de pirâmide)
    │   └── subtabs.js          ← Navegação entre sub-abas
    │
    ├── dashboard/              ← Módulo Dashboard (implementos)
    ├── equipamentos/           ← Módulo Equipamentos
    └── admin/                  ← Módulo Administração
```

---

## ⚙️ Como o sistema detecta se um ESP está online

**Regra:** Um ESP32 é considerado **online** somente se sua última leitura foi enviada há **menos de 15 minutos**.

Isso evita o problema de o painel mostrar como "online" um ESP que enviou dados dias atrás mas está desligado agora.

Se um ESP ficar 5 minutos sem enviar dados, o card da lagoa fica vermelho pulsante com "Offline".

---

## 🔧 Como configurar as dimensões das lagoas

1. Faça login no sistema
2. Vá na aba **Fertirrigação**
3. Clique em **Configuração Tanques**
4. Preencha para cada lagoa:
   - **Comp. Topo / Larg. Topo** — medida da borda superior da lagoa (metros)
   - **Comp. Fundo / Larg. Fundo** — medida do fundo da lagoa (metros)
   - **Profundidade Total** — altura total em metros (ex: 3.0)
5. Clique em **Salvar Dimensões**

> ⚠️ **Importante:** O sensor está instalado no TOPO e mede a **distância até a superfície da água**. Quanto mais cheio o tanque, menor o número que o sensor reporta. O sistema já faz essa inversão automaticamente.

---

## 🎨 Modo claro e escuro

Clique no botão **"Claro / Escuro"** no canto superior direito do cabeçalho para alternar o tema.

- **Modo Escuro** — fundo preto, letras brancas (padrão)
- **Modo Claro** — fundo branco, letras pretas

A preferência fica salva no navegador automaticamente.

---

## 📊 Regras das barras de tendência nos cards

Cada card da lagoa mostra um badge de tendência calculado nos últimos 5 minutos:

| Badge | Cor | Significado |
|-------|-----|-------------|
| ↑ Enchendo | Vermelho | Nível subiu mais de 5cm em 5 min |
| ↔ Estável | Azul | Variação menor que ±5cm em 5 min |
| ↓ Esvaziando | Verde | Nível baixou mais de 5cm em 5 min |
| ⏱ Coletando... | Cinza | Aguardando dados suficientes |
| 📶 Offline | Vermelho pulsante | Sem sinal por mais de 5 min |

---

## 💧 Como o Volume de Saída é calculado

O sistema monitora o volume total das 5 lagoas a cada leitura:

- Se o volume de uma lagoa **cai** mas nenhuma outra lagoa **sobe** no mesmo ciclo → o líquido saiu do sistema (por caminhão ou escoamento). Esse valor soma ao **Volume Acumulado de Saída**.
- Se uma lagoa **cai** e outra **sobe** proporcionalmente → é transferência interna, não conta como saída.

A **Meta de Aplicação na Safra** (padrão: 15.000.000 L) mede o progresso pelo Volume de Saída acumulado.

---

## 🚨 Alarmes

| Situação | O que acontece |
|----------|----------------|
| Lagoa ≥ 90% cheia | Card fica vermelho + badge "Alerta" pulsante |
| ESP offline > 5 min | Card borda vermelha + badge "Offline" |
| ESP antigo (>15 min) | Card não conta como "online" no resumo |

---

## 🌐 Firebase — Configuração

O sistema usa **dois projetos Firebase**:

1. **Firebase Principal** (`firebase-config.js`) — autenticação de usuários e banco de dados de equipamentos
2. **Firebase ESP32** (`fertirrigacao/firebase.js`) — recebe os dados dos sensores

Credenciais do Firebase ESP32:
```
Projeto: monitoramento-esp32-2551e
Caminho dos dados: fertirrigacao/dados/locais/
```

Cada tanque salva em: `fertirrigacao/dados/locais/T1/leituras`, `T2/leituras`, etc.

---

## 🔒 Regras do Firestore (obrigatório configurar)

No console do Firebase → Firestore → Regras, use:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /fertirrigacao/{document=**} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

---

## 🛠️ Manutenção Comum

### "O card da lagoa não atualiza"
1. Verifique se o ESP32 está ligado e conectado ao Wi-Fi
2. Abra o console do browser (F12 → Console) e procure erros `[FertiFirebase]`
3. Verifique se a última leitura no Firebase tem menos de 15 minutos

### "Aparece mais ESPs online do que o real"
- Isso era um bug corrigido na v9. O sistema agora só conta como "online" ESPs com leitura recente (< 15 min)

### "O modo claro não muda todas as cores"
- Verifique se o CSS `css/style_global.css` está sendo carregado no `index.html`
- O cache do browser pode estar usando versão antiga — pressione `Ctrl + Shift + R`

### "O volume está sendo calculado errado"
- Configure as dimensões reais na aba **Configuração Tanques**
- A fórmula usada é o Tronco de Pirâmide, que é a forma real de uma lagoa trapezoidal

---

## 📱 Compatibilidade

- ✅ Chrome, Edge, Firefox (versões modernas)
- ✅ Celular (layout responsivo)
- ✅ Menu lateral vira gaveta no celular (ícone ≡ no canto superior direito)
- ❌ Internet Explorer (não suportado)

---

## 📞 Suporte técnico

Email do projeto Firebase: `jtsdowload@gmail.com`

