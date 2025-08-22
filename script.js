// Substitua os campos abaixo com as suas configurações do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD6m7jDQfeGgAaKozzHlXsHfv-AQXsaKd4",
    authDomain: "appapontamentoprodutividade.firebaseapp.com",
    projectId: "appapontamentoprodutividade",
    storageBucket: "appapontamentoprodutividade.firebasestorage.app",
    messagingSenderId: "775647390603",
    appId: "1:775647390603:web:9febe5c49f08e5c04cdd8e",
    measurementId: "G-69RHFDSX4G"
    
};

// Inicializa o Firebase 
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let dadosDoRelatorio = [];
let todosColaboradores = []

const formatarTempo = (totalSegundos) => {
    if (totalSegundos === 0) return '00:00:00';
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    const formataHoras = String(horas).padStart(2, '0');
    const formataMinutos = String(minutos).padStart(2, '0');
    const formataSegundos = String(segundos).padStart(2, '0');
    return `${formataHoras}:${formataMinutos}:${formataSegundos}`;
};

const paginaAtual = window.location.pathname.split('/').pop();

if (paginaAtual === 'index.html' || paginaAtual === '') {
    const apontamentosTabela = document.getElementById('apontamentos-tabela');
    const cardComApontamento = document.getElementById('card-com-apontamento');
    const cardSemApontamento = document.getElementById('card-sem-apontamento');
    const cardParados = document.getElementById('card-parados');
    const cardParadosContainer = document.querySelector('.info-card.parado'); // Seleciona o card específico
    const filtroDataInput = document.getElementById('filtro-data');
    const btnFiltrar = document.getElementById('btn-filtrar');
    const btnLimpar = document.getElementById('btn-limpar');
    const graficoCanvas = document.getElementById('grafico-atividades');
    const graficoProdutividadeCanvas = document.getElementById('grafico-produtividade');
    
    const TOTAL_COLABORADORES = 37;
    let graficoAtividades;
    let graficoProdutividade;

    const renderizarApontamentos = (apontamentos) => {
        apontamentosTabela.innerHTML = '';
        let totalParados = 0;
        const contagemAtividades = {};
        
        apontamentos.forEach(apontamento => {
            const tr = document.createElement('tr');
            if (apontamento.atividade === 'Parado') {
                tr.classList.add('parado-row');
                totalParados++;
            }
            tr.innerHTML = `
                <td>${apontamento.colaborador}</td>
                <td>${apontamento.atividade}</td>
                <td>${apontamento.dataHoraFormatada}</td>
                <td>${apontamento.motivo || ''}</td>
            `;
            apontamentosTabela.appendChild(tr);
            contagemAtividades[`${apontamento.atividade}`] = (contagemAtividades[`${apontamento.atividade}`] || 0) + 1;
        });
        cardComApontamento.textContent = apontamentos.length;
        cardSemApontamento.textContent = TOTAL_COLABORADORES - apontamentos.length;
        cardParados.textContent = totalParados;

        const statusParadoDiv = document.getElementById('status-parado');
        if (totalParados > 0) {
            statusParadoDiv.style.display = 'block';
            cardParadosContainer.classList.add('alerta-parado'); // Adiciona a classe de animação ao card
        } else {
            statusParadoDiv.style.display = 'none';
            cardParadosContainer.classList.remove('alerta-parado'); // Remove a classe do card
        }

        atualizarGraficoPizza(contagemAtividades, apontamentos.length);
    };

    const buscarUltimaAtividadePorColaborador = async (dataFiltro = null) => {
        const ultimosApontamentos = [];
        const colaboradoresConsultados = new Set();
        const todosApontamentos = [];
        let query = db.collection('apontamentos').orderBy('dataHora', 'desc');

        if (dataFiltro) {
            const inicioDoDia = new Date(dataFiltro);
            inicioDoDia.setHours(0, 0, 0, 0);
            const fimDoDia = new Date(dataFiltro);
            fimDoDia.setHours(23, 59, 59, 999);
            query = query.where('dataHora', '>=', inicioDoDia).where('dataHora', '<=', fimDoDia);
        }

        try {
            const querySnapshot = await query.get();
            querySnapshot.forEach(doc => {
                const apontamento = doc.data();
                todosApontamentos.push(apontamento);
                if (!colaboradoresConsultados.has(apontamento.colaborador)) {
                    ultimosApontamentos.push(apontamento);
                    colaboradoresConsultados.add(apontamento.colaborador);
                }
            });
            renderizarApontamentos(dataFiltro ? todosApontamentos.reverse() : ultimosApontamentos);
            renderizarGraficoProdutividade(todosApontamentos);

        } catch (error) {
            console.error("Erro ao buscar as atividades:", error);
        }
    };

    const converterDuracaoParaSegundos = (duracao) => {
        if (!duracao) return 0;
        const partes = duracao.split(':');
        if (partes.length === 3) {
            return parseInt(partes[0]) * 3600 + parseInt(partes[1]) * 60 + parseInt(partes[2]);
        }
        return 0;
    };

    const renderizarGraficoProdutividade = (todosApontamentos) => {
        const dadosPorColaborador = {};
        todosApontamentos.forEach(apontamento => {
            const colaborador = apontamento.colaborador;
            const atividade = apontamento.atividade;
            const duracao = converterDuracaoParaSegundos(apontamento.duracaoFormatada);
            if (!dadosPorColaborador[colaborador]) {
                dadosPorColaborador[colaborador] = {};
            }
            dadosPorColaborador[colaborador][atividade] = (dadosPorColaborador[colaborador][atividade] || 0) + duracao;
        });
        const colaboradores = Object.keys(dadosPorColaborador);
        const atividades = ['Checklist', 'Deslocamento', 'Início da atividade', 'Parado', 'Almoço', 'Aguardando cliente'];

        const novaPaletaDeCores = {
            'Checklist': '#9319daff',
            'Deslocamento': '#bde62cff',
            'Início da atividade': '#2ba0eeff',
            'Parado': '#db160fff',
            'Almoço': '#41db33ff',
            'Aguardando cliente': '#ee9816ff'
        };

        const datasets = atividades.map(atividade => {
            return {
                label: atividade,
                data: colaboradores.map(colaborador => dadosPorColaborador[colaborador][atividade] || 0),
                backgroundColor: novaPaletaDeCores[atividade]
            };
        });

        if (graficoProdutividade) {
            graficoProdutividade.destroy();
        }

        if (graficoProdutividadeCanvas) {
            graficoProdutividade = new Chart(graficoProdutividadeCanvas, {
                type: 'bar',
                data: {
                    labels: colaboradores,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            stacked: true,
                            title: { display: true, text: 'Colaborador' }
                        },
                        y: {
                            stacked: true,
                            title: { display: true, text: 'Duração (hh:mm:ss)' },
                            ticks: {
                                callback: function(value, index, ticks) {
                                    return formatarTempo(value);
                                }
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) label += formatarTempo(context.parsed.y);
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }
    };

    db.collection('apontamentos').onSnapshot(() => {
        if (!filtroDataInput.value) {
            buscarUltimaAtividadePorColaborador();
        }
    });
    btnFiltrar.addEventListener('click', () => {
        const dataSelecionada = filtroDataInput.value;
        if (dataSelecionada) {
            buscarUltimaAtividadePorColaborador(dataSelecionada);
        }
    });
    btnLimpar.addEventListener('click', () => {
        filtroDataInput.value = '';
        buscarUltimaAtividadePorColaborador();
    });
    Chart.register(ChartDataLabels);
    const atualizarGraficoPizza = (contagem, totalApontamentos) => {
        const labels = Object.keys(contagem);
        const data = Object.values(contagem);
        if (graficoAtividades) {
            graficoAtividades.destroy();
        }
        
        const cores = ['#af1ddbff', '#24b82cff', '#e3f306e7', '#f10a0aff', '#229ce2ff', '#607D8B', '#FF7F50'];

        if (graficoCanvas) {
            graficoAtividades = new Chart(graficoCanvas, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Contagem de Atividades',
                        data: data,
                        backgroundColor: cores,
                        borderColor: '#574f4fff',
                        borderWidth: 2,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'top' },
                        datalabels: {
                            formatter: (value, ctx) => {
                                let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                let percentage = (value * 100 / sum).toFixed(2) + "%";
                                return percentage;
                            },
                            color: '#fff',
                            font: { weight: 'bold', size: 14 }
                        }
                    }
                }
            });
        }
    };
    buscarUltimaAtividadePorColaborador();
}
else if (paginaAtual === 'relatorio.html') {
    const filtroColaborador = document.getElementById('filtro-colaborador');
    const filtroDataInicio = document.getElementById('filtro-data-inicio');
    const filtroDataFim = document.getElementById('filtro-data-fim');
    const btnGerarRelatorio = document.getElementById('btn-gerar-relatorio');
    const tabelaBody = document.querySelector('#relatorio-tabela tbody');
    const btnExportarExcel = document.getElementById('btn-exportar-excel');
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');

    const listaDeColaboradores = [
        'ADRIANO', 'ALEXSSANDER', 'ALORRAM', 'ALVARO', 'ANDRE', 'ANTONIO', 'CAIQUE',
        'SANTANA', 'BINI', 'CARLOS HENRIQUE', 'DIEGO', 'EDJALMA', 'EDSON', 'EDVALDO',
        'ZANETTI', 'SOUZA', 'FREDSON', 'GUILHERME', 'IRINEU', 'JEFFERSON', 'JESUS',
        'LUCAS', 'LUIS FELIPE', 'LUIS HENRIQUE', 'MARCOS', 'MAURICIO', 'MAYCON',
        'MAYKO', 'PAULO', 'RAVELI', 'RICARDO O.', 'RICARDO A.', 'RODOLFO', 'RODRIGO',
        'SILAS', 'VIEIRA', 'WELLINGTON'
    ].sort();

    const carregarColaboradores = () => {
        listaDeColaboradores.forEach(colaborador => {
            const option = document.createElement('option');
            option.value = colaborador;
            option.textContent = colaborador;
            filtroColaborador.appendChild(option);
        });
    };

    const gerarRelatorio = async () => {
        const colaborador = filtroColaborador.value;
        const dataInicioStr = filtroDataInicio.value;
        const dataFimStr = filtroDataFim.value;

        if (!dataInicioStr || !dataFimStr) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }

        const dataInicio = new Date(dataInicioStr);
        const dataFim = new Date(dataFimStr);
        dataFim.setHours(23, 59, 59, 999);

        let query = db.collection('apontamentos')
                      .orderBy('dataHora', 'desc')
                      .where('dataHora', '>=', dataInicio)
                      .where('dataHora', '<=', dataFim);

        if (colaborador) {
            query = query.where('colaborador', '==', colaborador);
        }

        try {
            const querySnapshot = await query.get();
            dadosDoRelatorio = [];
            tabelaBody.innerHTML = '';
            
            querySnapshot.forEach(doc => {
                const apontamento = doc.data();
                dadosDoRelatorio.push(apontamento);
                const tr = document.createElement('tr');
                if (apontamento.atividade === 'Parado') {
                    tr.classList.add('parado-row');
                }
                tr.innerHTML = `
                    <td>${apontamento.atividade}</td>
                    <td>${apontamento.colaborador}</td>
                    <td>${apontamento.dataHoraFormatada}</td>
                    <td>${apontamento.duracaoFormatada}</td>
                    <td>${apontamento.motivo || ''}</td>
                `;
                tabelaBody.appendChild(tr);
            });
            
            if (dadosDoRelatorio.length === 0) {
                tabelaBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum apontamento encontrado para o filtro selecionado.</td></tr>';
            }

        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            alert('Ocorreu um erro ao buscar os dados.');
        }
    };

    const exportarParaExcel = () => {
        if (dadosDoRelatorio.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const dadosParaExportar = dadosDoRelatorio.map(item => ({
            Atividade: item.atividade,
            Colaborador: item.colaborador,
            "Data e Hora": item.dataHoraFormatada,
            Duração: item.duracaoFormatada,
            Motivo: item.motivo || ''
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dadosParaExportar);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório de Produtividade");
        XLSX.writeFile(workbook, "Relatorio_Produtividade.xlsx");
    };

    const exportarParaPdf = () => {
        if (dadosDoRelatorio.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }
        
        const tabelaHtml = document.getElementById('relatorio-tabela').outerHTML;
        const janelaImpressao = window.open('', '', 'height=600,width=800');
        janelaImpressao.document.write('<html><head><title>Relatório de Produtividade</title>');
        janelaImpressao.document.write('<style>');
        janelaImpressao.document.write('body{font-family: Arial, sans-serif; padding: 20px;}');
        janelaImpressao.document.write('table{width: 100%; border-collapse: collapse;}');
        janelaImpressao.document.write('th, td{border: 1px solid #ddd; padding: 8px; text-align: left;}');
        janelaImpressao.document.write('th{background-color: #f2f2f2;}');
        janelaImpressao.document.write('.parado-row{background-color: #ffcccc;}');
        janelaImpressao.document.write('</style></head><body>');
        janelaImpressao.document.write('<h1>Relatório de Produtividade</h1>');
        janelaImpressao.document.write(tabelaHtml);
        janelaImpressao.document.write('</body></html>');
        janelaImpressao.document.close();
        janelaImpressao.print();
    };

    btnGerarRelatorio.addEventListener('click', gerarRelatorio);
    btnExportarExcel.addEventListener('click', exportarParaExcel);
    btnExportarPdf.addEventListener('click', exportarParaPdf);
    
    carregarColaboradores();
}