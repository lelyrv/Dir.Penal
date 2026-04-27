function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('closed');
}

// Fecha o menu automaticamente em dispositivos móveis ao clicar em um link
document.querySelectorAll('.menu-artigos a').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth < 768) {
            document.getElementById('sidebar').classList.add('closed');
        }
    });
});