// =================================================================
// SCRIPT.JS - VERSÃO FINAL CORRIGIDA
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
    // Firebase já foi inicializado, o que é normal em ambientes de desenvolvimento com recarregamento.
}
const db = firebase.firestore();

// ===== Utils =====
let dadosDoRelatorio = [];
const TOTAL_COLABORADORES = 16;

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

const ATIVIDADES = ["Checklist", "Deslocamento", "Em Atividade", "Parado", "Almoço", "Aguardando cliente", "Carregamento"];
const CORES_ATIVIDADES = {
 "Checklist": "#8e00e0ff", 
"Deslocamento": "#d1d400ff", 
"Em Atividade": "#38c202ff",
"Parado": "#ff0800ff", 
"Almoço": "#0594e7ff", 
"Aguardando cliente": "#fd7a00ff", 
  "Carregamento": "#5a5a59ff",
};

// ===== Render Functions =====
const renderizarStatusAtual = (ultimosApontamentos) => {
  if (!apontamentosTabela) return;
  apontamentosTabela.innerHTML = "";
  const totalComApontamento = ultimosApontamentos.length;
  let totalParados = 0;

  ultimosApontamentos.sort((a, b) => b.dataHoraInicio - a.dataHoraInicio);

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

const atualizarGraficoPizzaHistorico = (apontamentos) => {
  if (!graficoCanvas) return;
  if (graficoAtividades) graficoAtividades.destroy();
  
  const apontamentosValidos = apontamentos.filter(a => a.atividade);
  
  const contagem = {};
  apontamentosValidos.forEach(a => {
    let atividadePadronizada = a.atividade;
    if (a.atividade && a.atividade.toLowerCase().trim() === "início da atividade") {
      atividadePadronizada = "Em Atividade";
    }
    contagem[atividadePadronizada] = (contagem[atividadePadronizada] || 0) + 1;
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

const renderizarGraficoProdutividade = (apontamentos) => {
  if (!graficoProdutividadeCanvas) return;
  if (graficoProdutividade) graficoProdutividade.destroy();

  const apontamentosValidos = apontamentos.filter(a => a.colaborador);
  const porColaborador = {};
  apontamentosValidos.forEach(a => {
    const col = a.colaborador || "—";
    const ativ = (a.atividade && a.atividade.toLowerCase().trim() === "início da atividade") ? "Em Atividade" : (a.atividade || "—");
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

const carregarDadosDoPainel = async (dataInicioStr = null, dataFimStr = null) => {
  limparPainelVisualmente();

  let inicio, fim;
  if (dataInicioStr && dataFimStr) {
    inicio = new Date(dataInicioStr);
    inicio.setHours(0, 0, 0, 0);
    fim = new Date(dataFimStr);
    fim.setHours(23, 59, 59, 999);
  } else {
    const hoje = new Date();
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
  }

  // Restaura a busca em tempo real para a tabela.
  let queryStatus = db.collection("apontamentos_realtime")
    .where("dataHoraInicio", ">=", inicio.getTime())
    .where("dataHoraInicio", "<=", fim.getTime())
    .orderBy("dataHoraInicio", "desc");

  queryStatus.onSnapshot((snap) => {
    if (snap.empty) {
      renderizarStatusAtual([]);
      return;
    }
    const ultimosApontamentosMap = new Map();
    snap.forEach(doc => {
      const apontamento = doc.data();
      if (!ultimosApontamentosMap.has(apontamento.colaborador)) {
        ultimosApontamentosMap.set(apontamento.colaborador, apontamento);
      }
    });
    renderizarStatusAtual(Array.from(ultimosApontamentosMap.values()));
  }, (error) => console.error("Erro ao buscar status em tempo real:", error));

  try {
 let queryGraficos = db.collection("apontamentos")
  .where("dataHora", ">=", inicio.getTime())
  .where("dataHora", "<=", fim.getTime());

    const snapshot = await queryGraficos.get();
    
    const apontamentosDoPeriodo = [];
    snapshot.forEach(doc => apontamentosDoPeriodo.push(doc.data()));
    
    dadosDoRelatorio = apontamentosDoPeriodo;
    
    if (apontamentosDoPeriodo.length > 0) {
        atualizarGraficoPizzaHistorico(apontamentosDoPeriodo);
        renderizarGraficoProdutividade(apontamentosDoPeriodo);
    } else {
        console.log("Nenhum dado histórico encontrado para os gráficos no período selecionado.");
    }
  } catch (e) {
    console.error("ERRO CRÍTICO AO BUSCAR DADOS PARA OS GRÁFICOS:", e);
  }
};


// ===== Funções de Controle e Exportação =====

const limparPainelVisualmente = () => {
    if(apontamentosTabela) apontamentosTabela.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum dado encontrado para o período.</td></tr>';
    if(cardComApontamento) cardComApontamento.textContent = "0";
    if(cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES;
    if(cardParados) cardParados.textContent = "0";
    if(cardParadosContainer) cardParadosContainer.classList.remove("alerta-parado");
    if (graficoAtividades) graficoAtividades.destroy();
    if (graficoProdutividade) graficoProdutividade.destroy();
    dadosDoRelatorio = [];
};

const zerarRegistrosDoBanco = async () => {
  const confirmacao1 = confirm("ATENÇÃO: AÇÃO IRREVERSÍVEL!\n\nVocê tem certeza que deseja apagar PERMANENTEMENTE todos os registros de apontamento do banco de dados?");
  if (!confirmacao1) return alert("Operação cancelada.");

  const confirmacao2 = confirm("CONFIRMAÇÃO FINAL:\n\nTodos os dados de produtividade serão perdidos. Esta ação não pode ser desfeita. Deseja continuar?");
  if (!confirmacao2) return alert("Operação cancelada.");

  alert("Iniciando a exclusão de todos os registros. Por favor, aguarde o aviso de conclusão.");

  try {
    const snapshot = await db.collection("apontamentos").get();
    if (snapshot.empty) {
      alert("O banco de dados 'apontamentos' já está vazio.");
      limparPainelVisualmente();
      return;
    }
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    limparPainelVisualmente();
    alert(`SUCESSO!\n\n${snapshot.size} registros foram apagados permanentemente do banco de dados 'apontamentos'.`);
  } catch (error) {
    console.error("Erro ao apagar registros:", error);
    alert("Ocorreu um erro ao apagar os registros. Verifique o console (F12) e as regras de segurança do seu Firestore.");
  }
};

const exportarProdutividadeExcel = () => {
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar. Selecione um período com dados.");
    const dadosPorColaborador = {};
    dadosDoRelatorio.forEach(a => {
        const col = a.colaborador || "—";
        const ativ = (a.atividade && a.atividade.toLowerCase().trim() === "início da atividade") ? "Em Atividade" : (a.atividade || "—");
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
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar. Selecione um período com dados.");
    const dadosParaExportar = dadosDoRelatorio.map(a => ({
        Colaborador: a.colaborador || "—",
        Atividade: (a.atividade && a.atividade.toLowerCase().trim() === "início da atividade") ? "Em Atividade" : (a.atividade || "—"),
        "Data e Hora": a.dataHoraFormatada || "—",
        "Duração": a.duracaoFormatada || "00:00:00",
        Motivo: a.motivo || "—"
    }));
    const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Apontamentos Detalhados");
    XLSX.writeFile(wb, "Apontamentos_Detalhado.xlsx");
};

const exportarHistoricoPdf = () => {
    if (dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar. Selecione um período com dados.");
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
if (btnFiltrar) {
    btnFiltrar.addEventListener("click", () => {
        const dataInicio = filtroDataInicio.value;
        const dataFim = filtroDataFim.value;
        if (!dataInicio || !dataFim) {
            return alert("Por favor, selecione a data de início e a data de fim para filtrar.");
        }
        carregarDadosDoPainel(dataInicio, dataFim);
    });
}

if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
        if(filtroDataInicio) filtroDataInicio.value = "";
        if(filtroDataFim) filtroDataFim.value = "";
        // Ao limpar, volta a carregar os dados do dia atual
        carregarDadosDoPainel();
    });
}

if (btnLimparPainel) btnLimparPainel.addEventListener("click", zerarRegistrosDoBanco);
if (btnExportarExcel) btnExportarExcel.addEventListener("click", exportarProdutividadeExcel);
if (btnExportarExcelDetalhado) btnExportarExcelDetalhado.addEventListener("click", exportarDetalhadoExcel);
if (btnExportarPdf) btnExportarPdf.addEventListener("click", exportarHistoricoPdf);

// ===== Initial Load =====
document.addEventListener('DOMContentLoaded', () => {
    carregarDadosDoPainel();

function atualizarGraficosDoDia() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0,0,0,0);
  const fim    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23,59,59,999);

  db.collection("apontamentos")
    .where("dataHora", ">=", inicio.getTime())
    .where("dataHora", "<=", fim.getTime())
    .get()
    .then(snapshot => {
      const apontamentosHoje = [];
      snapshot.forEach(doc => apontamentosHoje.push(doc.data()));

      atualizarGraficoPizzaHistorico(apontamentosHoje);
      renderizarGraficoProdutividade(apontamentosHoje);
    })
    .catch(err => console.error("Erro ao atualizar gráficos:", err));
}
document.getElementById("atualizar-paineis").addEventListener("click", () => {
  atualizarGraficosDoDia();
});


});