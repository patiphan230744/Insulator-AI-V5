// Initialization order: configuration and modules load before bootstrapping.
cloudInit();
readProjects(); syncSelectors();
initStorage().then(()=>{renderProjects();refreshDashboard();window.V5?.init();}).catch(console.error);
