// =================================================================
// SCRIPT.JS - VERSÃO FINAL COM EXCLUSÃO DE DADOS NO FIREBASE
// =================================================================

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyD6m7jDQfeGgAaKozzHlXsHfv-AQXsaKd4",
  authDomain: "appapontamentoprodutividade.firebaseapp.com",
  projectId: "appapontamentoprodutividade",
  storageBucket: "appapontamentoprodutividade.firebasestorage.app",
  messagingSenderId: "775647390603",
  appId: "1:775647390603:web:9febe5c49f08e5c04cdd8e",
  measurementId: "G-69RHFDSX4G"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch(e) {
    console.error("Firebase já foi inicializado.");
}
const db = firebase.firestore();

// ===== Utils =====
let dadosDoRelatorio = [];
const TOTAL_COLABORADORES = 38;

const formatarTempo = (totalSegundos) => {
  if (isNaN(totalSegundos) || totalSegundos <= 0) return "00:00:00";
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = Math.floor(totalSegundos % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
};

const converterDuracaoParaSegundos = (duracaoStr) => {
    if (!duracaoStr || typeof duracaoStr !== 'string') return 0;
    const partes = duracaoStr.split(':');
    if (partes.length !== 3) return 0;
    const horas = parseInt(partes[0], 10) || 0;
    const minutos = parseInt(partes[1], 10) || 0;
    const segundos = parseInt(partes[2], 10) || 0;
    return (horas * 3600) + (minutos * 60) + segundos;
};

// ===== DOM Elements =====
const apontamentosTabela = document.getElementById("apontamentos-tabela");
const cardComApontamento = document.getElementById("card-com-apontamento");
const cardSemApontamento = document.getElementById("card-sem-apontamento");
const cardParados = document.getElementById("card-parados");
const cardParadosContainer = document.querySelector(".info-card.parado");
const graficoCanvas = document.getElementById("grafico-atividades");
const graficoProdutividadeCanvas = document.getElementById("grafico-produtividade");
const filtroDataInicio = document.getElementById("filtro-data-inicio");
const filtroDataFim = document.getElementById("filtro-data-fim");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpar = document.getElementById("btn-limpar");
const btnLimparPainel = document.getElementById("btn-limpar-painel");
const btnExportarExcel = document.getElementById("btn-exportar-excel");
const btnExportarExcelDetalhado = document.getElementById("btn-exportar-excel-detalhado");
const btnExportarPdf = document.getElementById("btn-exportar-pdf");

// ===== Chart Instances =====
let graficoAtividades;
let graficoProdutividade;

if (window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

const ATIVIDADES = ["Checklist", "Deslocamento", "Início da atividade", "Parado", "Almoço", "Aguardando cliente"];
const CORES_ATIVIDADES = {
  "Checklist": "#9319daff", "Deslocamento": "#bde62cff", "Início da atividade": "#2ba0eeff",
  "Parado": "#db160fff", "Almoço": "#41db33ff", "Aguardando cliente": "#ee9816ff"
};

// ===== Render Functions =====
const renderizarStatusAtual = (ultimosApontamentos) => {
  if (!apontamentosTabela) return;
  apontamentosTabela.innerHTML = "";
  const totalComApontamento = ultimosApontamentos.length;
  let totalParados = 0;

  ultimosApontamentos.sort((a, b) => b.dataHora - a.dataHora);

  ultimosApontamentos.forEach(a => {
    if (a.atividade === "Parado") totalParados++;
    const tr = document.createElement("tr");
    tr.classList.toggle("parado-row", a.atividade === "Parado");
    tr.innerHTML = `
      <td>${a.colaborador || 'N/A'}</td>
      <td>${a.atividade || 'N/A'}</td>
      <td>${a.dataHoraFormatada || "Data inválida"}</td>
      <td>${a.motivo || ""}</td>
    `;
    apontamentosTabela.appendChild(tr);
  });

  if (cardComApontamento) cardComApontamento.textContent = totalComApontamento;
  if (cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES - totalComApontamento;
  if (cardParados) cardParados.textContent = totalParados;
  if (cardParadosContainer) cardParadosContainer.classList.toggle("alerta-parado", totalParados > 0);
};

const atualizarGraficoPizzaHistorico = (todosApontamentos) => {
  if (!graficoCanvas) return;
  if (graficoAtividades) graficoAtividades.destroy();
  const contagem = {};
  todosApontamentos.forEach(a => {
    contagem[a.atividade] = (contagem[a.atividade] || 0) + 1;
  });

  const labels = Object.keys(contagem);
  const data = Object.values(contagem);

  graficoAtividades = new Chart(graficoCanvas, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: labels.map(label => CORES_ATIVIDADES[label] || '#607D8B') }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
        datalabels: {
          formatter: (value, ctx) => {
            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0) || 1;
            return `${(value * 100 / sum).toFixed(1)}%`;
          },
          color: "#fff", font: { weight: "bold", size: 14 }
        }
      }
    }
  });
};

const renderizarGraficoProdutividade = (todosApontamentos) => {
  if (!graficoProdutividadeCanvas) return;
  if (graficoProdutividade) graficoProdutividade.destroy();

  const porColaborador = {};
  todosApontamentos.forEach(a => {
    const col = a.colaborador || "—";
    const ativ = a.atividade || "—";
    const seg = converterDuracaoParaSegundos(a.duracaoFormatada);

    if (!porColaborador[col]) {
      porColaborador[col] = {};
      ATIVIDADES.forEach(act => porColaborador[col][act] = 0);
    }
    porColaborador[col][ativ] += seg;
  });

  const colaboradores = Object.keys(porColaborador).sort();
  const datasets = ATIVIDADES.map(atividade => ({
    label: atividade,
    data: colaboradores.map(c => porColaborador[c][atividade] || 0),
    backgroundColor: CORES_ATIVIDADES[atividade]
  }));

  graficoProdutividade = new Chart(graficoProdutividadeCanvas, {
    type: "bar",
    data: { labels: colaboradores, datasets },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => formatarTempo(v) } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatarTempo(ctx.parsed.y)}` } } }
    }
  });
};

// ===== Data Fetching =====
const buscarPorPeriodo = async (dataInicioStr = null, dataFimStr = null) => {
  let query = db.collection("apontamentos").orderBy("dataHora", "desc");

  if (dataInicioStr && dataFimStr) {
    const ini = new Date(dataInicioStr); ini.setHours(0, 0, 0, 0);
    const fim = new Date(dataFimStr); fim.setHours(23, 59, 59, 999);
    query = query.where("dataHora", ">=", ini.getTime()).where("dataHora", "<=", fim.getTime());
  }

  try {
    const snap = await query.get();
    if (snap.empty) {
      limparPainelVisualmente();
      return;
    }

    const todosApontamentosDoFiltro = [];
    const ultimosApontamentosMap = new Map();

    snap.forEach(doc => {
      const apontamento = doc.data();
      todosApontamentosDoFiltro.push(apontamento);
      if (!ultimosApontamentosMap.has(apontamento.colaborador)) {
        ultimosApontamentosMap.set(apontamento.colaborador, apontamento);
      }
    });

    const ultimosApontamentosArray = Array.from(ultimosApontamentosMap.values());
    
    renderizarStatusAtual(ultimosApontamentosArray);
    atualizarGraficoPizzaHistorico(todosApontamentosDoFiltro);
    renderizarGraficoProdutividade(todosApontamentosDoFiltro);
    
    dadosDoRelatorio = todosApontamentosDoFiltro;

  } catch (e) {
    console.error("ERRO CRÍTICO AO BUSCAR DADOS:", e);
  }
};

// ===== Funções de Controle e Exportação =====

const limparPainelVisualmente = () => {
    if(apontamentosTabela) apontamentosTabela.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum dado encontrado.</td></tr>';
    if(cardComApontamento) cardComApontamento.textContent = "0";
    if(cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES;
    if(cardParados) cardParados.textContent = "0";
    if(cardParadosContainer) cardParadosContainer.classList.remove("alerta-parado");
    if (graficoAtividades) graficoAtividades.destroy();
    if (graficoProdutividade) graficoProdutividade.destroy();
    dadosDoRelatorio = [];
};

// **INÍCIO: FUNÇÃO DE EXCLUSÃO PERMANENTE**
const zerarRegistrosDoBanco = async () => {
  // 1. Confirmação dupla para segurança
  const confirmacao1 = confirm("ATENÇÃO: AÇÃO IRREVERSÍVEL!\n\nVocê tem certeza que deseja apagar PERMANENTEMENTE todos os registros de apontamento do banco de dados?");
  if (!confirmacao1) {
    alert("Operação cancelada.");
    return;
  }

  const confirmacao2 = confirm("CONFIRMAÇÃO FINAL:\n\nTodos os dados de produtividade serão perdidos. Esta ação não pode ser desfeita. Deseja continuar?");
  if (!confirmacao2) {
    alert("Operação cancelada.");
    return;
  }

  alert("Iniciando a exclusão de todos os registros. Por favor, aguarde o aviso de conclusão.");

  try {
    const snapshot = await db.collection("apontamentos").get();

    if (snapshot.empty) {
      alert("O banco de dados já está vazio.");
      limparPainelVisualmente();
      return;
    }

    // Apaga os documentos em lotes para evitar sobrecarga
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    limparPainelVisualmente();
    alert(`SUCESSO!\n\n${snapshot.size} registros foram apagados permanentemente do banco de dados.`);

  } catch (error) {
    console.error("Erro ao apagar registros:", error);
    alert("Ocorreu um erro ao apagar os registros. Verifique o console (F12) e as regras de segurança do seu Firestore.");
  }
};
// **FIM: FUNÇÃO DE EXCLUSÃO PERMANENTE**

const exportarProdutividadeExcel = () => {
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const dadosPorColaborador = {};
    dadosDoRelatorio.forEach(a => {
        const col = a.colaborador || "—";
        const ativ = a.atividade || "—";
        const seg = converterDuracaoParaSegundos(a.duracaoFormatada);
        if (!dadosPorColaborador[col]) {
            dadosPorColaborador[col] = {};
            ATIVIDADES.forEach(act => dadosPorColaborador[col][act] = 0);
        }
        dadosPorColaborador[col][ativ] += seg;
    });
    const dadosParaExportar = Object.keys(dadosPorColaborador).map(colaborador => {
        const linha = { Colaborador: colaborador };
        ATIVIDADES.forEach(act => {
            linha[act] = formatarTempo(dadosPorColaborador[colaborador][act] || 0);
        });
        return linha;
    });
    const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtividade Consolidada");
    XLSX.writeFile(wb, "Produtividade_Consolidada.xlsx");
};

const exportarDetalhadoExcel = () => {
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const dadosParaExportar = dadosDoRelatorio.map(a => ({
        Colaborador: a.colaborador || "—",
        Atividade: a.atividade || "—",
        "Data e Hora": a.dataHoraFormatada || "—",
        "Duração": a.duracaoFormatada || "00:00:00",
        Motivo: a.motivo || "—"
    }));
    const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Apontamentos Detalhados");
    XLSX.writeFile(wb, "Apontamentos_Detalhados.xlsx");
};

const exportarHistoricoPdf = () => {
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const tabelaParaImpressao = document.createElement('table');
    tabelaParaImpressao.innerHTML = apontamentosTabela.innerHTML;
    tabelaParaImpressao.insertAdjacentHTML('afterbegin', '<thead>' + document.querySelector('#tabela-apontamentos thead').innerHTML + '</thead>');
    const win = window.open("", "", "height=600,width=800");
    win.document.write("<html><head><title>Histórico de Atividades</title>");
    win.document.write('<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f2f2f2}.parado-row{background-color:#ffdddd;font-weight:bold;}</style>');
    win.document.write("</head><body><h1>Histórico de Atividades</h1>");
    win.document.write(tabelaParaImpressao.outerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
};

// ===== Event Listeners =====
if (btnFiltrar) btnFiltrar.addEventListener("click", () => buscarPorPeriodo(filtroDataInicio.value, filtroDataFim.value));
if (btnLimpar) btnLimpar.addEventListener("click", () => {
    if(filtroDataInicio) filtroDataInicio.value = "";
    if(filtroDataFim) filtroDataFim.value = "";
    buscarPorPeriodo();
});

// **CONEXÃO DO BOTÃO COM A FUNÇÃO DE EXCLUSÃO**
if (btnLimparPainel) btnLimparPainel.addEventListener("click", zerarRegistrosDoBanco);

if (btnExportarExcel) btnExportarExcel.addEventListener("click", exportarProdutividadeExcel);
if (btnExportarExcelDetalhado) btnExportarExcelDetalhado.addEventListener("click", exportarDetalhadoExcel);
if (btnExportarPdf) btnExportarPdf.addEventListener("click", exportarHistoricoPdf);

// ===== Initial Load =====
document.addEventListener('DOMContentLoaded', (event) => {
    buscarPorPeriodo();
});
