using HcPhotoSearch.Worker;
using HcPhotoSearch.Worker.Services;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddHttpClient<VolusionClient>();
builder.Services.AddSingleton<MeiliSearchService>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
