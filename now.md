---
layout: default
title: "Now"
permalink: /now/
og_title: "Sol Nicol — Now"
og_description: "Active build loop: stabilising ZIGGY’s memory spine, fixing the vault tunnel, and mapping Scotland’s DeFi proof-of-work."
og_image: /og.jpg
---

{% assign now = site.data.now %}

<section>
  <div class="hero-grid">
    <div class="hero-copy">
      <p class="section-heading">{{ now.hero.kicker }}</p>
      <h1>{{ now.hero.name }}</h1>
      <p>{{ now.hero.intro }}</p>
      <a class="cta-link" href="{{ now.hero.cta.url }}">{{ now.hero.cta.label }}</a>
    </div>
    <div class="card">
      <div class="chip">{{ now.status }}</div>
      <p class="muted">{{ now.bio }}</p>
    </div>
  </div>
</section>

<section>
  <p class="section-heading">Current focus</p>
  <div class="card-grid">
    {% for item in now.focus %}
      <div class="card">
        <h4>{{ item.title }}</h4>
        <p>{{ item.description }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Loops</p>
  <div class="loop-list">
    {% for loop in now.loops %}
      <div class="loop-card">
        <div class="chip">{{ loop.label }}</div>
        <p>{{ loop.detail }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Experiments</p>
  <div class="card-grid">
    {% for experiment in now.experiments %}
      <div class="card">
        <h4>{{ experiment.title }}</h4>
        <p>{{ experiment.description }}</p>
      </div>
    {% endfor %}
  </div>
</section>

<section>
  <p class="section-heading">Links</p>
  <div class="link-row">
    {% for link in now.links %}
      <a href="{{ link.url }}">{{ link.label }}</a>
    {% endfor %}
  </div>
</section>
