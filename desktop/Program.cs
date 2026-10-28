// Mi Audioship para Windows: sirve la pagina (incluida dentro del .exe) en http://localhost:8080,
// abre el navegador y queda en la bandeja del sistema. Compilar con desktop\compilar.ps1.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    const int Puerto = 8080; // debe coincidir con el origen autorizado en Google Cloud
    static readonly string Url = "http://localhost:" + Puerto + "/";
    static HttpListener listener;

    static readonly Dictionary<string, string> Tipos = new Dictionary<string, string>
    {
        { ".html", "text/html; charset=utf-8" }, { ".js", "text/javascript; charset=utf-8" },
        { ".mjs", "text/javascript; charset=utf-8" }, { ".css", "text/css; charset=utf-8" },
        { ".json", "application/json" }, { ".svg", "image/svg+xml" }, { ".png", "image/png" }, { ".ico", "image/x-icon" }
    };

    static bool sinNavegador;

    [STAThread] static void Main(string[] args) { sinNavegador = Array.IndexOf(args, "--sin-navegador") >= 0; Iniciar(); }

    static void Iniciar()
    {
        bool nuevo;
        using (var mutex = new Mutex(true, "MiAudioship_unica_instancia", out nuevo))
        {
            if (!nuevo) { AbrirNavegador(); return; } // ya esta corriendo: solo abre la pagina

            Application.EnableVisualStyles();
            try
            {
                listener = new HttpListener();
                listener.Prefixes.Add(Url);
                listener.Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo usar el puerto " + Puerto + ". Puede que otro programa lo este usando.\n\n" + ex.Message,
                    "Mi Audioship", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            var hilo = new Thread(Servir) { IsBackground = true };
            hilo.Start();

            var menu = new ContextMenuStrip();
            menu.Items.Add("Abrir Mi Audioship", null, delegate { AbrirNavegador(); });
            menu.Items.Add("Salir", null, delegate { Application.Exit(); });
            var icono = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location),
                Text = "Mi Audioship (" + Url + ")",
                ContextMenuStrip = menu,
                Visible = true
            };
            icono.DoubleClick += delegate { AbrirNavegador(); };
            icono.ShowBalloonTip(4000, "Mi Audioship", "Abierto en tu navegador. Sigue aqui junto al reloj; clic derecho > Salir para cerrarlo.", ToolTipIcon.Info);

            AbrirNavegador();
            Application.Run();
            icono.Visible = false;
            try { listener.Stop(); } catch { }
        }
    }

    static void AbrirNavegador()
    {
        if (sinNavegador) return;
        try { Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true }); } catch { }
    }

    static void Servir()
    {
        var asm = Assembly.GetExecutingAssembly();
        while (listener.IsListening)
        {
            HttpListenerContext c;
            try { c = listener.GetContext(); } catch { return; }
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    string ruta = Uri.UnescapeDataString(c.Request.Url.AbsolutePath).TrimStart('/');
                    if (ruta == "") ruta = "index.html";
                    // Los archivos de la pagina van incrustados como recursos "web/<ruta>"
                    using (Stream s = asm.GetManifestResourceStream("web/" + ruta))
                    {
                        if (s == null) { c.Response.StatusCode = 404; }
                        else
                        {
                            string tipo;
                            if (Tipos.TryGetValue(Path.GetExtension(ruta).ToLowerInvariant(), out tipo)) c.Response.ContentType = tipo;
                            c.Response.Headers["Cache-Control"] = "no-cache";
                            c.Response.ContentLength64 = s.Length;
                            if (c.Request.HttpMethod != "HEAD") s.CopyTo(c.Response.OutputStream);
                        }
                    }
                }
                catch { }
                try { c.Response.Close(); } catch { }
            });
        }
    }
}
