---
layout: default
title: Home
og_title: "Sol Nicol — Builder & engineer"
og_description: "Proving the next decade through ZIGGY, private agent infrastructure, and a DeFi proof-of-work cycle."
og_image: /og.jpg
---

{% assign home = site.data.home %}

<section>
  <div class="hero-grid">
    <div class="hero-copy">
      <p class="section-heading">{{ home.hero.kicker }}</p>
      <h1>{{ home.hero.name }}</h1>
      <p>{{ home.hero.intro }}</p>
      <a class="cta-link" href="{{ home.hero.cta.url }}">{{ home.hero.cta.label }}</a>
    </div>
    <div class="metric-grid">
      {% for metric in home.metrics %}
        <div class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      {% endfor %}
    </div>
  </div>
</section>

<section>
  <p class="section-heading">Thesis</p>
  <p class="lead">{{ home.bio }}</p>
  <div class="pillars-grid">
    {% for pillar in home.pillars %}
      <div class="card">
        <div class="chip">{{ pillar.title }}</div>
        <p>{{ pillar.description }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Live work</p>
  <div class="card-grid">
    {% for build in home.builds %}
      <div class="card">
        {% if build.tag %}<div class="chip">{{ build.tag }}</div>{% endif %}
        <h4>{{ build.title }}</h4>
        <p>{{ build.description }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Signal</p>
  <div class="timeline">
    {% for signal in home.signals %}
      <div class="timeline-item">
        <span>{{ signal.era }}</span>
        <strong>{{ signal.title }}</strong>
        <p class="muted">{{ signal.detail }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Contact</p>
  <div class="link-row">
    {% for link in home.links %}
      <a href="{{ link.url }}">{{ link.label }}</a>
    {% endfor %}
  </div>
</section>
